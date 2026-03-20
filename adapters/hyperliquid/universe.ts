import type { Liquidity } from "../../types";
import annotationCache from "./annotation-cache.json" with { type: "json" };
import {
  HIP3_EQUIVALENT_ALIASES,
  HIP3_MANUAL_PROFILES,
  type Hip3AssetClass,
  type Hip3ManualProfile,
} from "./hip3-manual";

const API = "https://api.hyperliquid.xyz/info";

export const DEFAULT_ENABLED_DEXES = ["xyz", "vntl", "cash", "km", "flx", "hyna"] as const;

const DEX_PRIORITY = ["default", "xyz", "cash", "km", "vntl", "flx", "hyna", "abcd"] as const;

type AssetClass = Hip3AssetClass;

type MatchKind = "exact" | "prefixed" | "alias" | "query";

interface HLMeta {
  universe: Array<{
    name: string;
    szDecimals: number;
    maxLeverage: number;
    marginTableId?: number;
    isDelisted?: boolean;
  }>;
}

interface HLAssetCtx {
  funding: string;
  openInterest: string;
  dayNtlVlm: string;
  dayBaseVlm?: string;
  oraclePx: string;
  markPx: string;
  midPx: string;
  prevDayPx: string;
  premium: string;
}

interface HLPerpDexRaw {
  name: string;
  fullName?: string;
  deployer?: string | null;
  oracleUpdater?: string | null;
  feeRecipient?: string | null;
  assetToStreamingOiCap?: Array<[string, string]>;
  assetToFundingMultiplier?: Array<[string, string]>;
  assetToFundingInterestRate?: Array<[string, string]>;
}

interface HLPerpAnnotationRaw {
  category?: string | null;
  description?: string | null;
}

interface SemanticMetadata {
  asset_class: AssetClass;
  theme_tags: string[];
  instrument_description?: string;
  pricing_note?: string;
  reference_symbols?: string[];
  search_aliases?: string[];
  routing_note?: string;
}

const PRIVATE_VALUATION_BASES = new Set(["SPACEX", "OPENAI", "ANTHROPIC"]);
const INDEX_BASES = new Set([
  "XYZ100",
  "MAG7",
  "SEMIS",
  "ROBOT",
  "INFOTECH",
  "NUCLEAR",
  "DEFENSE",
  "ENERGY",
  "BIOTECH",
  "SP500",
  "USA500",
  "US500",
  "USTECH",
  "USBOND",
  "SMALL2000",
  "USENERGY",
  "SEMI",
  "GLDMINE",
  "EWJ",
  "EWY",
  "URNM",
]);
const COMMODITY_BASES = new Set([
  "GOLD",
  "SILVER",
  "PLATINUM",
  "PALLADIUM",
  "CL",
  "OIL",
  "USOIL",
  "NATGAS",
  "GAS",
  "COPPER",
]);
const FX_BASES = new Set(["EUR", "JPY"]);

const THEME_TAGS_BY_BASE: Record<string, string[]> = {
  SPACEX: ["private-markets", "space", "aerospace"],
  OPENAI: ["private-markets", "ai"],
  ANTHROPIC: ["private-markets", "ai"],
  DEFENSE: ["defense", "aerospace"],
  NUCLEAR: ["nuclear", "energy"],
  ENERGY: ["energy", "oil-gas"],
  SEMIS: ["semiconductors", "ai"],
  INFOTECH: ["technology"],
  MAG7: ["mega-cap-tech"],
  ROBOT: ["robotics", "automation"],
  BIOTECH: ["biotech", "healthcare"],
  XYZ100: ["us-tech-index"],
  SP500: ["us-large-cap-index"],
  USA500: ["us-large-cap-index"],
  US500: ["us-large-cap-index"],
  USTECH: ["us-tech-index"],
  USBOND: ["rates", "bonds"],
  USENERGY: ["energy"],
  GLDMINE: ["gold", "miners"],
  GOLD: ["gold"],
  SILVER: ["silver"],
  CL: ["oil"],
  OIL: ["oil"],
  USOIL: ["oil"],
  NATGAS: ["natural-gas"],
  COPPER: ["industrial-metals"],
  URNM: ["uranium"],
  USAR: ["rare-earths", "materials"],
  COIN: ["crypto-equity"],
  MSTR: ["bitcoin-proxy"],
};

const DESCRIPTION_BY_BASE: Record<string, string> = {
  SPACEX: "Private company valuation perpetual for SpaceX.",
  OPENAI: "Private company valuation perpetual for OpenAI.",
  ANTHROPIC: "Private company valuation perpetual for Anthropic.",
  DEFENSE: "Thematic index perpetual tracking defense-related equities.",
  NUCLEAR: "Thematic index perpetual tracking nuclear-related equities.",
  SEMIS: "Thematic index perpetual tracking semiconductor equities.",
  MAG7: "Thematic index perpetual tracking a mega-cap U.S. technology basket.",
  SP500: "Official S&P 500 perpetual on Hyperliquid (xyz:SP500).",
  USA500: "U.S. large-cap equity index perpetual (legacy, prefer SP500).",
  US500: "U.S. large-cap equity index perpetual.",
  USTECH: "U.S. technology index perpetual.",
  USBOND: "U.S. bond/rates exposure perpetual.",
  XYZ100: "U.S. growth-oriented equity index perpetual.",
};

const PRICING_NOTE_BY_BASE: Record<string, string> = {
  SPACEX: "Contract price tracks company valuation divided by 1B.",
  OPENAI: "Contract price tracks company valuation divided by 1B.",
  ANTHROPIC: "Contract price tracks company valuation divided by 1B.",
};

const ASSET_CLASS_BY_PERP_CATEGORY: Record<string, AssetClass> = {
  crypto: "crypto",
  stocks: "equity",
  indices: "index",
  commodities: "commodity",
  preipo: "private_valuation",
  fx: "fx",
};

/** Pre-computed search data, built once during universe assembly. */
interface SearchCache {
  aliases_lower: string[];
  normalized_aliases: string[];
  alias_tokens: string[];
  references_upper: string[];
}

export interface HlInstrument {
  full_symbol: string;
  base_symbol: string;
  dex: string;
  dex_full_name: string;
  mark_price?: number;
  oracle_price?: number;
  mid_price?: number;
  funding_rate_hourly?: number;
  funding_rate_annualized_pct?: number;
  open_interest_usd?: number;
  volume_24h_usd?: number;
  max_leverage?: number;
  liquidity?: Liquidity;
  oi_cap_usd?: number;
  funding_multiplier?: number;
  funding_interest_rate?: number;
  asset_class: AssetClass;
  theme_tags: string[];
  instrument_description?: string;
  pricing_note?: string;
  reference_symbols?: string[];
  search_aliases?: string[];
  routing_note?: string;
  source_warnings?: string[];
  /** @internal Pre-computed search data; not serialized to API responses. */
  _search?: SearchCache;
}

export interface HlDexSummary {
  dex: string;
  full_name: string;
  assets: number;
}

export interface HlUniverse {
  instruments: HlInstrument[];
  by_full_lower: Map<string, HlInstrument>;
  by_base_upper: Map<string, HlInstrument[]>;
  dex_summaries: HlDexSummary[];
  enabled_dexes: string[];
  diagnostics: HlUniverseBuildDiagnostics;
}

export interface HlUniverseBuildFailure {
  dex: string;
  reason: string;
}

export interface HlUniverseBuildDiagnostics {
  requested_dexes: string[];
  loaded_dexes: string[];
  failed_dexes: HlUniverseBuildFailure[];
  degraded: boolean;
  warnings: string[];
}

export interface HlResolution {
  instrument: HlInstrument;
  match_kind: MatchKind;
  confidence: number;
  selection_reason: string;
}

export interface HlQueryResult extends HlResolution {
  score: number;
}

interface BuildUniverseOptions {
  enabled_dexes?: string[];
  strict?: boolean;
  /** Include delisted instruments (default false). */
  include_delisted?: boolean;
}

interface AnnotationCacheFile {
  fetched_at?: string;
  annotations?: Record<string, HLPerpAnnotationRaw>;
}
interface AnnotationIndexes {
  by_symbol: Map<string, HLPerpAnnotationRaw>;
  by_base: Map<string, HLPerpAnnotationRaw>;
}

function normalizeAnnotationRecord(
  annotation: HLPerpAnnotationRaw | null | undefined,
): HLPerpAnnotationRaw | null {
  if (!annotation || typeof annotation !== "object") return null;
  const category = normalizePerpCategory(annotation.category);
  const description =
    typeof annotation.description === "string" && annotation.description.trim()
      ? annotation.description.trim()
      : undefined;
  if (!category && !description) return null;
  return {
    ...(category ? { category } : {}),
    ...(description ? { description } : {}),
  };
}

function mergeAnnotationRecords(
  existing: HLPerpAnnotationRaw | undefined,
  incoming: HLPerpAnnotationRaw,
): HLPerpAnnotationRaw {
  const existingDescription = existing?.description?.trim() ?? "";
  const incomingDescription = incoming.description?.trim() ?? "";
  return {
    category: existing?.category ?? incoming.category,
    description:
      incomingDescription.length > existingDescription.length
        ? incoming.description
        : existing?.description ?? incoming.description,
  };
}

function buildAnnotationIndexes(cache: AnnotationCacheFile | null | undefined): AnnotationIndexes {
  const bySymbol = new Map<string, HLPerpAnnotationRaw>();
  const byBase = new Map<string, HLPerpAnnotationRaw>();

  for (const [rawSymbol, rawAnnotation] of Object.entries(cache?.annotations ?? {})) {
    const annotation = normalizeAnnotationRecord(rawAnnotation);
    if (!annotation) continue;

    const symbol = rawSymbol.trim().toLowerCase();
    if (!symbol) continue;
    bySymbol.set(symbol, annotation);

    const { base } = splitSymbol(rawSymbol);
    const baseKey = normalizeBaseSymbol(base);
    if (!baseKey) continue;

    const existing = byBase.get(baseKey);
    byBase.set(
      baseKey,
      existing ? mergeAnnotationRecords(existing, annotation) : annotation,
    );
  }

  return { by_symbol: bySymbol, by_base: byBase };
}

// Lazy-initialized to avoid computing Maps on every import (matters for Worker cold starts).
let _annotationIndexes: AnnotationIndexes | null = null;
function getAnnotationIndexes(): AnnotationIndexes {
  if (!_annotationIndexes) {
    _annotationIndexes = buildAnnotationIndexes(annotationCache as AnnotationCacheFile);
  }
  return _annotationIndexes;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function assessLiquidity(dayNtlVlm: number | undefined): Liquidity | undefined {
  if (dayNtlVlm == null) return undefined;
  if (dayNtlVlm >= 100_000_000) return "high";
  if (dayNtlVlm >= 10_000_000) return "medium";
  return "low";
}

function dexPriorityIndex(dex: string): number {
  const idx = DEX_PRIORITY.indexOf(dex as (typeof DEX_PRIORITY)[number]);
  return idx === -1 ? DEX_PRIORITY.length : idx;
}

function compareByPolicy(a: HlInstrument, b: HlInstrument): number {
  const volA = a.volume_24h_usd ?? -1;
  const volB = b.volume_24h_usd ?? -1;
  if (volA !== volB) return volB - volA;

  const levA = a.max_leverage ?? -1;
  const levB = b.max_leverage ?? -1;
  if (levA !== levB) return levB - levA;

  const prio = dexPriorityIndex(a.dex) - dexPriorityIndex(b.dex);
  if (prio !== 0) return prio;

  return a.full_symbol.localeCompare(b.full_symbol);
}

function splitSymbol(name: string): { dex: string; base: string } {
  const idx = name.indexOf(":");
  if (idx === -1) return { dex: "default", base: name };
  return {
    dex: name.slice(0, idx).toLowerCase(),
    base: name.slice(idx + 1),
  };
}

function normalizeBaseSymbol(base: string): string {
  const trimmed = base.trim();
  if (!trimmed) return "";
  if (/^k[a-z0-9]+$/i.test(trimmed)) return `k${trimmed.slice(1).toUpperCase()}`;
  return trimmed.toUpperCase();
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2 && !GENERIC_QUERY_TOKENS.has(p));
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const GENERIC_ALIAS_TOKENS = new Set([
  "broad",
  "company",
  "equities",
  "equity",
  "etf",
  "exposure",
  "index",
  "market",
  "private",
  "sector",
  "style",
]);

const GENERIC_QUERY_TOKENS = new Set([
  "equities",
  "equity",
  "etf",
  "exposure",
  "index",
  "market",
  "markets",
  "sector",
  "stock",
  "stocks",
]);

function mergeStringLists(...lists: Array<string[] | undefined>): string[] | undefined {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const list of lists) {
    if (!list?.length) continue;
    for (const item of list) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(trimmed);
    }
  }

  return merged.length > 0 ? merged : undefined;
}

function getManualProfile(baseUpper: string): Hip3ManualProfile | undefined {
  return HIP3_MANUAL_PROFILES[baseUpper];
}

function getStaticAnnotation(
  fullSymbol: string,
  baseUpper: string,
): HLPerpAnnotationRaw | undefined {
  const indexes = getAnnotationIndexes();
  return indexes.by_symbol.get(fullSymbol.toLowerCase())
    ?? indexes.by_base.get(baseUpper);
}

function inferSemanticMetadata(dex: string, baseSymbol: string): SemanticMetadata {
  const baseUpper = baseSymbol.toUpperCase();
  const manual = getManualProfile(baseUpper);

  let assetClass: AssetClass = "other";
  if (dex === "default" || dex === "hyna") {
    assetClass = "crypto";
  } else if (PRIVATE_VALUATION_BASES.has(baseUpper)) {
    assetClass = "private_valuation";
  } else if (INDEX_BASES.has(baseUpper)) {
    assetClass = "index";
  } else if (COMMODITY_BASES.has(baseUpper)) {
    assetClass = "commodity";
  } else if (FX_BASES.has(baseUpper)) {
    assetClass = "fx";
  } else if (["xyz", "km", "cash", "flx", "vntl"].includes(dex)) {
    assetClass = "equity";
  }

  return {
    asset_class: manual?.asset_class ?? assetClass,
    theme_tags: mergeStringLists(THEME_TAGS_BY_BASE[baseUpper], manual?.theme_tags) ?? [],
    instrument_description: manual?.instrument_description ?? DESCRIPTION_BY_BASE[baseUpper],
    pricing_note: manual?.pricing_note ?? PRICING_NOTE_BY_BASE[baseUpper],
    reference_symbols: manual?.reference_symbols,
    search_aliases: manual?.search_aliases,
    routing_note: manual?.routing_note,
  };
}

async function postInfo<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Hyperliquid API error: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function fetchMetaAndCtxs(dex?: string): Promise<{ meta: HLMeta; ctxs: HLAssetCtx[] }> {
  const body: Record<string, unknown> = { type: "metaAndAssetCtxs" };
  if (dex) body.dex = dex;
  const [meta, ctxs] = await postInfo<[HLMeta, HLAssetCtx[]]>(body);
  return { meta, ctxs };
}

function arrayPairsToMap(entries: Array<[string, string]> | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!entries?.length) return map;
  for (const [key, raw] of entries) {
    const value = parseNumber(raw);
    if (value != null) map.set(key, value);
  }
  return map;
}

function normalizeEnabledDexes(input?: string[]): string[] {
  const source = input ?? [...DEFAULT_ENABLED_DEXES];
  const normalized = source
    .map((dex) => dex.trim().toLowerCase())
    .filter(Boolean)
    .filter((dex) => dex !== "default");
  return [...new Set(normalized)];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function normalizePerpCategory(category: unknown): string | undefined {
  if (typeof category !== "string") return undefined;
  const normalized = category.trim().toLowerCase();
  if (!normalized) return undefined;
  return normalized;
}

function parsePerpCategoryMap(raw: unknown): Map<string, string> {
  const parsed = new Map<string, string>();
  if (!Array.isArray(raw)) return parsed;
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const symbol = entry[0];
    const category = normalizePerpCategory(entry[1]);
    if (typeof symbol !== "string" || !category) continue;
    parsed.set(symbol.trim().toLowerCase(), category);
  }
  return parsed;
}

function resolvePerpCategory(categoriesBySymbol: Map<string, string>, fullSymbol: string, dex: string, base: string): string | undefined {
  const fullKey = fullSymbol.trim().toLowerCase();
  const baseKey = base.trim().toLowerCase();
  const dexKey = `${dex}:${base}`.toLowerCase();

  return categoriesBySymbol.get(fullKey) ?? categoriesBySymbol.get(dexKey) ?? categoriesBySymbol.get(baseKey);
}

export async function buildHlUniverse(options: BuildUniverseOptions = {}): Promise<HlUniverse> {
  const strict = options.strict ?? false;
  const enabledDexes = normalizeEnabledDexes(options.enabled_dexes);
  const requestedDexes = ["default", ...enabledDexes];
  const failedDexes: HlUniverseBuildFailure[] = [];
  const warnings: string[] = [];

  let perpDexsAvailable = false;
  let dexMeta = new Map<string, HLPerpDexRaw>();
  let perpCategoriesBySymbol = new Map<string, string>();
  const [perpDexsResult, perpCategoriesResult] = await Promise.allSettled([
    postInfo<Array<HLPerpDexRaw | null>>({ type: "perpDexs" }),
    postInfo<unknown>({ type: "perpCategories" }),
  ]);

  if (perpDexsResult.status === "fulfilled") {
    const perpDexs = perpDexsResult.value.filter((dex): dex is HLPerpDexRaw => Boolean(dex));
    dexMeta = new Map<string, HLPerpDexRaw>(perpDexs.map((dex) => [dex.name, dex]));
    perpDexsAvailable = true;
  } else {
    const reason = errorMessage(perpDexsResult.reason);
    failedDexes.push({ dex: "perpDexs", reason });
    warnings.push("perpDexs unavailable; dex metadata fields may be partial.");
    if (strict) {
      throw new Error(`buildHlUniverse strict mode: failed to fetch perpDexs (${reason})`);
    }
  }

  if (perpCategoriesResult.status === "fulfilled") {
    perpCategoriesBySymbol = parsePerpCategoryMap(perpCategoriesResult.value);
  } else {
    const reason = errorMessage(perpCategoriesResult.reason);
    failedDexes.push({ dex: "perpCategories", reason });
    warnings.push("perpCategories unavailable; using hardcoded asset-class fallbacks.");
  }

  let toFetch = enabledDexes;
  if (perpDexsAvailable) {
    const missingDexes = enabledDexes.filter((dex) => !dexMeta.has(dex));
    for (const dex of missingDexes) {
      failedDexes.push({ dex, reason: "Requested dex not present in live perpDexs list." });
    }
    if (missingDexes.length > 0) {
      warnings.push(`Some requested dexes are not active: ${missingDexes.join(", ")}`);
    }
    toFetch = enabledDexes.filter((dex) => dexMeta.has(dex));
  }

  const fetchTasks = [
    { dex: "default", promise: fetchMetaAndCtxs() },
    ...toFetch.map((dex) => ({ dex, promise: fetchMetaAndCtxs(dex) })),
  ];

  const settled = await Promise.allSettled(fetchTasks.map((t) => t.promise));
  const instruments: HlInstrument[] = [];
  const dexSummaries: HlDexSummary[] = [];
  const loadedDexes: string[] = [];

  for (let i = 0; i < settled.length; i++) {
    const task = fetchTasks[i]!;
    const result = settled[i]!;
    if (result.status !== "fulfilled") {
      failedDexes.push({ dex: task.dex, reason: errorMessage(result.reason) });
      continue;
    }

    const { meta, ctxs } = result.value;
    const dexConfig = dexMeta.get(task.dex);
    const dexName = task.dex;
    const dexFullName = dexName === "default" ? "Hyperliquid" : (dexConfig?.fullName ?? dexName);
    loadedDexes.push(dexName);
    dexSummaries.push({ dex: dexName, full_name: dexFullName, assets: meta.universe.length });

    const oiCaps = arrayPairsToMap(dexConfig?.assetToStreamingOiCap);
    const fundingMult = arrayPairsToMap(dexConfig?.assetToFundingMultiplier);
    const fundingRate = arrayPairsToMap(dexConfig?.assetToFundingInterestRate);

    for (let idx = 0; idx < meta.universe.length; idx++) {
      const info = meta.universe[idx];
      const ctx = ctxs[idx];
      if (!info || !ctx) continue;
      if (info.isDelisted && !options.include_delisted) continue;

      const name = info.name;
      const { dex: symbolDex, base } = splitSymbol(name);
      const actualDex = symbolDex || dexName;
      const actualDexConfig = dexMeta.get(actualDex);
      const actualDexFullName = actualDex === "default" ? "Hyperliquid" : (actualDexConfig?.fullName ?? actualDex);

      const markPrice = parseNumber(ctx.markPx) ?? parseNumber(ctx.oraclePx);
      const oraclePrice = parseNumber(ctx.oraclePx);
      const midPrice = parseNumber(ctx.midPx);
      const funding = parseNumber(ctx.funding);
      const openInterest = parseNumber(ctx.openInterest);
      const dayNtlVlm = parseNumber(ctx.dayNtlVlm);

      const openInterestUsd =
        openInterest != null && oraclePrice != null ? Math.round(openInterest * oraclePrice) : undefined;

      const semantic = inferSemanticMetadata(actualDex, base);
      const perpCategory = resolvePerpCategory(perpCategoriesBySymbol, name, actualDex, base);
      const staticAnnotation = getStaticAnnotation(name, base.toUpperCase());
      const resolvedCategory = perpCategory ?? staticAnnotation?.category;
      const categoryAssetClass =
        resolvedCategory && Object.prototype.hasOwnProperty.call(ASSET_CLASS_BY_PERP_CATEGORY, resolvedCategory)
          ? ASSET_CLASS_BY_PERP_CATEGORY[resolvedCategory]
          : undefined;
      const sourceWarnings: string[] = [];
      if (actualDex === "cash" && base.toUpperCase() === "USA500") {
        sourceWarnings.push("USA500 is legacy; prefer xyz:SP500 (official S&P 500 perp).");
      }

      instruments.push({
        full_symbol: name,
        base_symbol: base,
        dex: actualDex,
        dex_full_name: actualDexFullName,
        mark_price: markPrice,
        oracle_price: oraclePrice,
        mid_price: midPrice,
        funding_rate_hourly: funding,
        funding_rate_annualized_pct: funding != null ? Math.round(funding * 24 * 365 * 100 * 100) / 100 : undefined,
        open_interest_usd: openInterestUsd,
        volume_24h_usd: dayNtlVlm != null ? Math.round(dayNtlVlm) : undefined,
        max_leverage: info.maxLeverage,
        liquidity: assessLiquidity(dayNtlVlm),
        oi_cap_usd: oiCaps.get(name),
        funding_multiplier: fundingMult.get(name),
        funding_interest_rate: fundingRate.get(name),
        asset_class: categoryAssetClass ?? semantic.asset_class,
        theme_tags: semantic.theme_tags,
        // Manual profile wins over stale bundled annotation; annotation is fallback.
        instrument_description: semantic.instrument_description ?? staticAnnotation?.description ?? undefined,
        pricing_note: semantic.pricing_note,
        reference_symbols: semantic.reference_symbols,
        search_aliases: semantic.search_aliases,
        routing_note: semantic.routing_note,
        source_warnings: sourceWarnings.length ? sourceWarnings : undefined,
      });
    }
  }

  // Pre-compute search data for all instruments.
  for (const inst of instruments) {
    const aliases = (inst.search_aliases ?? []).map((a) => a.toLowerCase());
    inst._search = {
      aliases_lower: aliases,
      normalized_aliases: aliases.map(normalizeSearchText),
      alias_tokens: aliases.flatMap(tokenizeQuery),
      references_upper: (inst.reference_symbols ?? []).map((s) => s.toUpperCase()),
    };
  }

  if (strict && failedDexes.length > 0) {
    const summary = failedDexes.map((entry) => `${entry.dex}: ${entry.reason}`).join(" | ");
    throw new Error(`buildHlUniverse strict mode: failed dex fetches (${summary})`);
  }

  if (loadedDexes.length === 0) {
    warnings.push("No Hyperliquid dex data loaded; universe is empty.");
  }

  const byFullLower = new Map<string, HlInstrument>();
  const byBaseUpper = new Map<string, HlInstrument[]>();

  for (const instrument of instruments) {
    byFullLower.set(instrument.full_symbol.toLowerCase(), instrument);
    const key = instrument.base_symbol.toUpperCase();
    const existing = byBaseUpper.get(key) ?? [];
    existing.push(instrument);
    byBaseUpper.set(key, existing);
  }

  return {
    instruments,
    by_full_lower: byFullLower,
    by_base_upper: byBaseUpper,
    dex_summaries: dexSummaries.sort((a, b) => a.dex.localeCompare(b.dex)),
    enabled_dexes: loadedDexes,
    diagnostics: {
      requested_dexes: requestedDexes,
      loaded_dexes: loadedDexes,
      failed_dexes: failedDexes,
      degraded: failedDexes.length > 0,
      warnings,
    },
  };
}

export function summarizeUniverseDegradation(universe: HlUniverse): string | null {
  if (!universe.diagnostics.degraded) return null;
  const loaded = universe.diagnostics.loaded_dexes.join(", ") || "none";
  const failed = universe.diagnostics.failed_dexes
    .map((entry) => `${entry.dex} (${entry.reason})`)
    .join("; ");
  return `degraded universe: loaded=[${loaded}] failed=[${failed || "none"}]`;
}

function getSortedBaseMatches(universe: HlUniverse, baseKeyUpper: string): HlInstrument[] {
  return [...(universe.by_base_upper.get(baseKeyUpper) ?? [])].sort(compareByPolicy);
}

function confidenceFromScore(score: number): number {
  return Math.max(0.5, Math.min(0.95, 0.5 + score / 20));
}

export function resolveTicker(
  rawInput: string,
  universe: HlUniverse,
  opts: { allow_prefix_match?: boolean } = {}
): HlResolution | null {
  const cleaned = rawInput.trim().replace(/-PERP$/i, "");
  if (!cleaned) return null;

  // Full symbol path: dex:BASE
  if (cleaned.includes(":")) {
    const [dexRaw, ...rest] = cleaned.split(":");
    const baseRaw = rest.join(":");
    if (!dexRaw || !baseRaw) return null;

    const dex = dexRaw.toLowerCase();
    const base = normalizeBaseSymbol(baseRaw);
    const normalizedFull = dex === "default" ? base : `${dex}:${base}`;
    const match =
      universe.by_full_lower.get(normalizedFull.toLowerCase()) ??
      universe.by_full_lower.get(cleaned.toLowerCase());
    if (!match) return null;
    return {
      instrument: match,
      match_kind: "exact",
      confidence: 1,
      selection_reason: `Exact symbol match (${match.full_symbol}).`,
    };
  }

  const base = normalizeBaseSymbol(cleaned);
  const baseKeyUpper = base.toUpperCase();

  // Common ETF / benchmark aliases mapped to their HIP-3 equivalents.
  const equivalentBase = HIP3_EQUIVALENT_ALIASES[baseKeyUpper];
  if (equivalentBase && equivalentBase !== baseKeyUpper) {
    const mapped = resolveTicker(equivalentBase, universe, opts);
    if (mapped) {
      return {
        ...mapped,
        match_kind: "alias",
        selection_reason: `Alias ${baseKeyUpper} mapped to HL equivalent ${equivalentBase}.`,
      };
    }
  }

  // Keep legacy behavior for default-listed assets.
  const defaultExact = universe.by_full_lower.get(base.toLowerCase());
  if (defaultExact && defaultExact.dex === "default") {
    return {
      instrument: defaultExact,
      match_kind: "exact",
      confidence: 1,
      selection_reason: `Exact default-dex match (${defaultExact.full_symbol}).`,
    };
  }

  const exactMatches = getSortedBaseMatches(universe, baseKeyUpper);
  if (exactMatches.length === 1) {
    return {
      instrument: exactMatches[0]!,
      match_kind: "exact",
      confidence: 0.99,
      selection_reason: `Exact symbol match (${exactMatches[0]!.full_symbol}).`,
    };
  }
  if (exactMatches.length > 1) {
    const selected = exactMatches[0]!;
    return {
      instrument: selected,
      match_kind: "exact",
      confidence: 0.92,
      selection_reason: `Matched ${exactMatches.length} venues; selected ${selected.full_symbol} by liquidity/leverage policy.`,
    };
  }

  // Alias path for sub-penny symbols (PEPE -> kPEPE).
  if (!baseKeyUpper.startsWith("K")) {
    const kMatches = getSortedBaseMatches(universe, `K${baseKeyUpper}`);
    if (kMatches.length > 0) {
      const selected = kMatches[0]!;
      return {
        instrument: selected,
        match_kind: "alias",
        confidence: 0.88,
        selection_reason: `Mapped ${base} to ${selected.base_symbol} via k-prefix alias.`,
      };
    }
  }

  if (opts.allow_prefix_match ?? true) {
    const prefixMatches = universe.instruments
      .filter((inst) => {
        const candidate = inst.base_symbol.toUpperCase();
        return candidate.startsWith(baseKeyUpper) && candidate !== baseKeyUpper;
      })
      .sort(compareByPolicy);

    if (prefixMatches.length > 0) {
      const selected = prefixMatches[0]!;
      return {
        instrument: selected,
        match_kind: "prefixed",
        confidence: 0.7,
        selection_reason: `Prefix match: ${base} -> ${selected.base_symbol}.`,
      };
    }
  }

  return null;
}

function scoreInstrumentForQuery(
  inst: HlInstrument,
  queryLower: string,
  normalizedQuery: string,
  tokens: string[],
): { score: number; reasons: string[] } {
  const fullLower = inst.full_symbol.toLowerCase();
  const baseUpper = inst.base_symbol.toUpperCase();
  const desc = (inst.instrument_description ?? "").toLowerCase();
  const tags = inst.theme_tags.map((t) => t.toLowerCase());
  // Use pre-computed search data (built during universe assembly).
  const search = inst._search;
  const aliases = search?.aliases_lower ?? [];
  const normalizedAliases = search?.normalized_aliases ?? [];
  const aliasTokens = search?.alias_tokens ?? [];
  const references = search?.references_upper ?? [];

  let score = 0;
  let hasSemanticHit = false;
  const reasons: string[] = [];

  for (let i = 0; i < aliases.length; i++) {
    const alias = aliases[i]!;
    const normalizedAlias = normalizedAliases[i]!;
    if (alias && queryLower.includes(alias)) {
      score += 5;
      hasSemanticHit = true;
      reasons.push(`alias ${alias}`);
      continue;
    }
    if (normalizedAlias && normalizedQuery.includes(normalizedAlias)) {
      score += 5;
      hasSemanticHit = true;
      reasons.push(`alias ${alias}`);
    }
  }

  for (const token of tokens) {
    const tokenUpper = token.toUpperCase();
    if (baseUpper === tokenUpper || fullLower === token) {
      score += 8;
      hasSemanticHit = true;
      reasons.push(`exact token ${tokenUpper}`);
      continue;
    }
    if (baseUpper.includes(tokenUpper)) {
      score += 4;
      hasSemanticHit = true;
      reasons.push(`symbol contains ${tokenUpper}`);
    }
    if (fullLower.includes(token)) {
      score += 2;
      hasSemanticHit = true;
    }
    if (inst.dex === token) {
      score += 2;
      hasSemanticHit = true;
      reasons.push(`dex ${inst.dex}`);
    }
    if (inst.asset_class.toLowerCase().includes(token)) {
      score += 2;
      hasSemanticHit = true;
      reasons.push(`asset class ${inst.asset_class}`);
    }
    if (references.some((reference) => reference === tokenUpper)) {
      score += 5;
      hasSemanticHit = true;
      reasons.push(`reference ${tokenUpper}`);
    }
    if (
      token.length >= 4
      && !GENERIC_ALIAS_TOKENS.has(token)
      && aliasTokens.some((aliasToken) => aliasToken === token)
    ) {
      score += 3;
      hasSemanticHit = true;
      reasons.push(`alias ${token}`);
    }
    if (tags.some((tag) => tag.includes(token))) {
      score += 3;
      hasSemanticHit = true;
      reasons.push(`theme ${token}`);
    }
    if (desc.includes(token)) {
      score += 2;
      hasSemanticHit = true;
    }
  }

  if (tokens.length === 0 || hasSemanticHit) {
    if (inst.liquidity === "high") score += 1;
    if (inst.liquidity === "medium") score += 0.5;
  }

  return { score, reasons };
}

export function searchInstruments(universe: HlUniverse, query: string, limit = 5): HlQueryResult[] {
  const tokens = tokenizeQuery(query);
  const queryLower = query.toLowerCase();
  const normalizedQuery = normalizeSearchText(query);
  const ranked = universe.instruments
    .map((inst) => {
      const { score, reasons } = scoreInstrumentForQuery(inst, queryLower, normalizedQuery, tokens);
      return {
        instrument: inst,
        score,
        reasons,
      };
    })
    .filter((x) => x.score > 0 || tokens.length === 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return compareByPolicy(a.instrument, b.instrument);
    })
    .slice(0, limit);

  return ranked.map((item) => ({
    instrument: item.instrument,
    match_kind: "query",
    confidence: confidenceFromScore(item.score),
    selection_reason:
      item.reasons.length > 0
        ? `Query match via ${item.reasons.slice(0, 2).join(", ")}.`
        : "Query-ranked by liquidity and venue policy.",
    score: item.score,
  }));
}
