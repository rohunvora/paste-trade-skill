#!/usr/bin/env bun
/**
 * Pull trade ideas from paste.trade as a signal feed.
 *
 * Usage:
 *   bun run scripts/feed.ts                          # latest 10 HL-executable trades
 *   bun run scripts/feed.ts --all                    # latest 10 trades (all platforms)
 *   bun run scripts/feed.ts --ticker BTC             # filter by ticker
 *   bun run scripts/feed.ts --direction long          # filter by direction
 *   bun run scripts/feed.ts --limit 20               # more results
 *   bun run scripts/feed.ts --id <trade_id>          # get one trade's full details
 *   bun run scripts/feed.ts --execute <trade_id>     # output execute.ts-ready JSON for a trade
 */

const PASTE_TRADE_API = "https://paste.trade/api/trades";

interface FeedTrade {
  id: string;
  ticker: string;
  direction: string;
  thesis: string;
  author_handle: string;
  author_price: number | null;
  posted_price: number | null;
  platform: string;
  instrument: string;
  trade_type: string;
  horizon: string | null;
  source_url: string | null;
  created_at: string;
  headline_quote?: string;
  derivation?: { explanation?: string };
}

function parseArgs() {
  const args = process.argv.slice(2);
  let showAll = false;
  let ticker: string | null = null;
  let direction: string | null = null;
  let limit = 10;
  let tradeId: string | null = null;
  let executeId: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--all") showAll = true;
    else if (args[i] === "--ticker" && args[i + 1]) ticker = args[++i]!.toUpperCase();
    else if (args[i] === "--direction" && args[i + 1]) direction = args[++i]!.toLowerCase();
    else if (args[i] === "--limit" && args[i + 1]) limit = parseInt(args[++i]!, 10);
    else if (args[i] === "--id" && args[i + 1]) tradeId = args[++i]!;
    else if (args[i] === "--execute" && args[i + 1]) executeId = args[++i]!;
  }

  return { showAll, ticker, direction, limit, tradeId, executeId };
}

async function fetchTrades(cursor?: string): Promise<{ trades: FeedTrade[]; next_cursor: string | null; total: number }> {
  const url = new URL(PASTE_TRADE_API);
  if (cursor) url.searchParams.set("cursor", cursor);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data = await res.json() as any;
  return {
    trades: Array.isArray(data.items) ? data.items : (Array.isArray(data.trades) ? data.trades : (Array.isArray(data) ? data : [])),
    next_cursor: data.next_cursor ?? null,
    total: data.total ?? 0,
  };
}

async function fetchTradeById(id: string): Promise<FeedTrade | null> {
  const res = await fetch(`${PASTE_TRADE_API}/${id}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  return await res.json() as FeedTrade;
}

const { showAll, ticker, direction, limit, tradeId, executeId } = parseArgs();

// Helper: find trade by full or partial ID from the feed
async function findTrade(idPrefix: string): Promise<FeedTrade | null> {
  // Try direct API lookup first
  const direct = await fetchTradeById(idPrefix).catch(() => null);
  if (direct) return direct;
  // Fall back to scanning feed for partial match
  let cursor: string | undefined;
  for (let page = 0; page < 5; page++) {
    const result = await fetchTrades(cursor);
    const match = result.trades.find(t => t.id.startsWith(idPrefix));
    if (match) return match;
    if (!result.next_cursor) break;
    cursor = result.next_cursor;
  }
  return null;
}

// Single trade detail
if (tradeId) {
  const trade = await findTrade(tradeId);
  if (!trade) {
    console.error(`Trade ${tradeId} not found`);
    process.exit(1);
  }
  console.log(JSON.stringify(trade, null, 2));
  process.exit(0);
}

// Generate execute.ts input for a specific trade
if (executeId) {
  const trade = await findTrade(executeId);
  if (!trade) {
    console.error(`Trade ${executeId} not found`);
    process.exit(1);
  }
  if (trade.platform !== "hyperliquid") {
    console.error(`Trade ${executeId} is on ${trade.platform}, not Hyperliquid. Cannot execute.`);
    process.exit(1);
  }
  const dir = trade.direction === "long" || trade.direction === "short" ? trade.direction : "long";
  const executePayload = {
    ticker: trade.ticker,
    direction: dir,
    size_usd: 50,
    leverage: 2,
    order_type: "market",
  };
  console.log(JSON.stringify(executePayload, null, 2));
  console.error(`\nTo execute: echo '${JSON.stringify(executePayload)}' | bun run scripts/execute.ts`);
  process.exit(0);
}

// Feed listing
let allTrades: FeedTrade[] = [];
let cursor: string | undefined;
let total = 0;

// Fetch enough pages to fill the limit
while (allTrades.length < limit * 3) { // fetch extra to account for filtering
  const page = await fetchTrades(cursor);
  total = page.total;
  allTrades.push(...page.trades);
  if (!page.next_cursor || allTrades.length >= 100) break;
  cursor = page.next_cursor;
}

// Filter
let filtered = allTrades;
if (!showAll) filtered = filtered.filter(t => t.platform === "hyperliquid");
if (ticker) filtered = filtered.filter(t => t.ticker?.toUpperCase() === ticker);
if (direction) filtered = filtered.filter(t => t.direction === direction);
filtered = filtered.slice(0, limit);

if (filtered.length === 0) {
  console.error("No matching trades found.");
  console.error(showAll ? "" : "Tip: use --all to include non-Hyperliquid trades.");
  process.exit(0);
}

// Compact display
console.error(`\n📡 paste.trade feed (${total} total trades, showing ${filtered.length})\n`);

const rows = filtered.map(t => {
  const dir = t.direction === "long" ? "LONG " : "SHORT";
  const price = t.author_price ? `$${t.author_price.toLocaleString()}` : "—";
  const platform = t.platform === "hyperliquid" ? "HL" : t.platform === "robinhood" ? "RH" : "PM";
  const thesis = (t.thesis || "").slice(0, 80);
  const author = t.author_handle ? `@${t.author_handle.replace(/^@/, "")}` : "anon";
  return {
    id: t.id,
    summary: `${dir} ${t.ticker.padEnd(8)} ${price.padEnd(10)} [${platform}] ${author}\n     ${thesis}`,
  };
});

for (const row of rows) {
  console.log(`  ${row.id.slice(0, 8)}  ${row.summary}`);
  console.log();
}

console.error(`Execute any trade: bun run scripts/feed.ts --execute <id>`);
