/**
 * Board API POST
 *
 * Wraps the HTTP POST so BOARD_URL from .env is available.
 * Accepts JSON payload as CLI argument or via stdin (for large payloads
 * that break shell quoting).
 *
 * Usage:
 *   bun run skill/adapters/board/post.ts '<JSON payload>'
 *   echo '<JSON>' | bun run skill/adapters/board/post.ts
 */

import { applyRunId, extractRunIdArg } from "./run-id";
import { appendTraceEvent, hashForTrace } from "./trace-audit";
import { existsSync } from "fs";

const { runId, args } = extractRunIdArg(process.argv);
applyRunId(runId);

let payload = args[0];
if (!payload) {
  // Read from stdin if no CLI arg
  payload = await Bun.stdin.text();
}
if (!payload?.trim()) {
  console.error("Usage: bun run skill/adapters/board/post.ts '<JSON payload>' (or pipe via stdin)");
  process.exit(1);
}
payload = payload.trim();

// Validate JSON before sending
let body: any;
try {
  body = JSON.parse(payload);
} catch {
  console.error(`[board] Invalid JSON payload: ${payload.slice(0, 200)}`);
  process.exit(1);
}

interface SavedExtractionRecord {
  id?: string;
  run_id?: string;
  headline?: string;
  quotes?: unknown;
  route_status?: string;
  routed?: boolean;
  who?: unknown;
  route_evidence?: unknown;
}

function normalizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizeTicker(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function normalizeRouteStatus(value: SavedExtractionRecord): "routed" | "unrouted" | null {
  const raw = typeof value.route_status === "string" ? value.route_status.trim().toLowerCase() : "";
  if (raw === "routed" || raw === "unrouted") return raw;
  if (typeof value.routed === "boolean") return value.routed ? "routed" : "unrouted";
  return null;
}

const FALLBACK_REASON_TAGS = new Set([
  "direct_unavailable",
  "direct_unpriceable",
  "direct_mismatch",
  "direct_weaker_fit",
]);

async function loadExtractionById(runIdValue: string, thesisId: string): Promise<SavedExtractionRecord | null> {
  const extractionDir = new URL("../../../data/extractions", import.meta.url).pathname;
  if (!existsSync(extractionDir)) return null;
  const files = (await Array.fromAsync(new Bun.Glob("extraction-*.jsonl").scan(extractionDir)))
    .map((file) => `${extractionDir}/${file}`)
    .sort()
    .reverse();

  for (const file of files) {
    const content = await Bun.file(file).text();
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as SavedExtractionRecord;
        if (parsed.run_id === runIdValue && parsed.id === thesisId) {
          return parsed;
        }
      } catch {
        // Ignore malformed lines.
      }
    }
  }
  return null;
}

async function validatePayloadAgainstSavedExtraction(
  runIdValue: string | null,
  tradeBody: Record<string, unknown>,
): Promise<void> {
  if (!runIdValue) return;
  const thesisId = typeof tradeBody.thesis_id === "string" ? tradeBody.thesis_id.trim() : "";
  if (!thesisId) return;

  const extracted = await loadExtractionById(runIdValue, thesisId);
  if (!extracted) return;

  const extractedRouteStatus = normalizeRouteStatus(extracted);
  if (extractedRouteStatus === "routed") {
    if (!extracted.route_evidence || typeof extracted.route_evidence !== "object" || Array.isArray(extracted.route_evidence)) {
      console.error(
        `[board] routed thesis ${thesisId} is missing route_evidence. Refusing POST.`,
      );
      process.exit(1);
    }

    const routeEvidence = extracted.route_evidence as Record<string, unknown>;
    const selectedExpression =
      routeEvidence.selected_expression &&
      typeof routeEvidence.selected_expression === "object" &&
      !Array.isArray(routeEvidence.selected_expression)
        ? (routeEvidence.selected_expression as Record<string, unknown>)
        : null;
    if (!selectedExpression) {
      console.error(
        `[board] routed thesis ${thesisId} is missing route_evidence.selected_expression. Refusing POST.`,
      );
      process.exit(1);
    }

    const selectedTicker = normalizeTicker(selectedExpression.ticker);
    const postedTicker = normalizeTicker(tradeBody.ticker);
    if (selectedTicker && postedTicker && selectedTicker !== postedTicker) {
      console.error(
        `[board] posted ticker ${postedTicker} does not match selected_expression ticker ${selectedTicker} for thesis ${thesisId}. Refusing POST.`,
      );
      process.exit(1);
    }

    for (const field of ["direction", "instrument", "platform", "trade_type"] as const) {
      const selectedValue = typeof selectedExpression[field] === "string" ? selectedExpression[field]!.trim().toLowerCase() : "";
      const postedValue = typeof tradeBody[field] === "string" ? String(tradeBody[field]).trim().toLowerCase() : "";
      if (selectedValue && postedValue && selectedValue !== postedValue) {
        console.error(
          `[board] posted ${field}=${postedValue} does not match selected_expression ${field}=${selectedValue} for thesis ${thesisId}. Refusing POST.`,
        );
        process.exit(1);
      }
    }

    const directChecks = Array.isArray(routeEvidence.direct_checks) ? routeEvidence.direct_checks : [];
    const directTickers = new Set<string>();
    const executableDirectTickers = new Set<string>();
    for (const check of directChecks) {
      if (!check || typeof check !== "object" || Array.isArray(check)) continue;
      const record = check as Record<string, unknown>;
      const ticker = normalizeTicker(record.ticker_tested);
      if (!ticker) continue;
      directTickers.add(ticker);
      if (record.executable === true) executableDirectTickers.add(ticker);
    }

    const selectedIsProxy = !!(selectedTicker && !directTickers.has(selectedTicker));
    const fallbackTag = typeof routeEvidence.fallback_reason_tag === "string" ? routeEvidence.fallback_reason_tag.trim() : "";

    if (selectedIsProxy) {
      if (!fallbackTag || !FALLBACK_REASON_TAGS.has(fallbackTag)) {
        console.error(
          `[board] proxy route for thesis ${thesisId} is missing valid fallback_reason_tag. Refusing POST.`,
        );
        process.exit(1);
      }
      if (executableDirectTickers.size > 0 && fallbackTag !== "direct_weaker_fit") {
        console.error(
          `[board] proxy route for thesis ${thesisId} has executable direct checks and must use fallback_reason_tag=direct_weaker_fit. Refusing POST.`,
        );
        process.exit(1);
      }
    }
  }

  const extractedQuotes = Array.isArray(extracted.quotes)
    ? extracted.quotes
        .map((entry) => normalizeText(entry))
        .filter(Boolean)
    : [];
  const extractedQuoteSet = new Set(extractedQuotes);

  if (extractedQuoteSet.size > 0) {
    const headlineQuote = normalizeText(tradeBody.headline_quote);
    if (headlineQuote && !extractedQuoteSet.has(headlineQuote)) {
      console.error(
        `[board] headline_quote must match the thesis quotes saved in extraction ${thesisId}. Refusing POST.`,
      );
      process.exit(1);
    }

    const segments = (tradeBody.derivation as { segments?: unknown } | undefined)?.segments;
    if (Array.isArray(segments) && segments.length > 0) {
      const segmentQuoteMatches = segments.some((segment) => {
        if (!segment || typeof segment !== "object") return false;
        const quote = normalizeText((segment as { quote?: unknown }).quote);
        return !!quote && extractedQuoteSet.has(quote);
      });

      if (!segmentQuoteMatches) {
        console.error(
          `[board] derivation segments do not include any quote saved for thesis ${thesisId}. Refusing POST.`,
        );
        process.exit(1);
      }
    }
  }
}

// If this POST belongs to an active source run, bind the trade to that source_id.
// This prevents multi-thesis / timeline runs from fragmenting into separate sources
// when individual trade payloads use per-thesis source_url values.
try {
  const { getStreamContext } = await import("./stream-context");
  const ctx = getStreamContext(runId);
  if (ctx && !body.source_id) {
    body.source_id = ctx.source_id;
    payload = JSON.stringify(body);
  }
} catch { /* stream context is optional */ }

await validatePayloadAgainstSavedExtraction(runId, body as Record<string, unknown>);

// Auto-provision API key if missing, resolve base URL
import { ensureKey, getBaseUrl } from "./ensure-key";
const baseUrl = getBaseUrl();
const apiKey = await ensureKey();
if (!apiKey) {
  console.error("[board] No API key — trade will not be attributed. Run failed.");
  process.exit(1);
}
console.error(`[board] POST to ${baseUrl}/api/trades`);

const headers: Record<string, string> = { "Content-Type": "application/json" };
headers["Authorization"] = `Bearer ${apiKey}`;

const res = await fetch(`${baseUrl}/api/trades`, {
  method: "POST",
  headers,
  body: payload,
});

const text = await res.text();
if (!res.ok) {
  console.error(`[board] Failed (${res.status}): ${text}`);
  process.exit(1);
}

// Surface API warnings so the operator sees data quality issues during /trade runs
try {
  const result = JSON.parse(text);
  if (result.warnings && Array.isArray(result.warnings)) {
    for (const w of result.warnings) {
      console.error(`[API WARNING] ${w}`);
    }
    if (result.warnings.length >= 3) {
      console.error(`[API] ${result.warnings.length} warnings on trade POST — review output above`);
    }
  }
} catch { /* response wasn't JSON — unusual but non-fatal */ }

console.log(text);

appendTraceEvent({
  type: "trade_run_trade_posted",
  runIdHash: runId ? hashForTrace(runId) : null,
  ticker: typeof body.ticker === "string" ? body.ticker : null,
  direction: typeof body.direction === "string" ? body.direction : null,
  thesisId: typeof body.thesis_id === "string" ? body.thesis_id : null,
  payloadChars: payload.length,
});

// Auto-push trade_routed event if streaming context exists
try {
  const { getStreamContext, pushEvent } = await import("./stream-context");
  const ctx = getStreamContext(runId);
  if (ctx) {
    // Push trade_routed so the viewer sees the ticker badge on the thesis pill
    await pushEvent(ctx.source_id, "trade_routed", {
      message: `${body.ticker} ${body.direction?.toUpperCase()} at $${body.entry_price}`,
      thesis_id: body.thesis_id ?? null,
      ticker: body.ticker,
      direction: body.direction,
      platform: body.platform,
      entry_price: body.entry_price,
    }, { runId });

    if (body.source_theses && Array.isArray(body.source_theses)) {
      console.error("[board] source_theses detected on trade POST. Finalize explicitly with bun run skill/adapters/board/finalize-source.ts ...");
    }
  }
} catch { /* streaming is optional */ }
