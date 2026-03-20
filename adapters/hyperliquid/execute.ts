/**
 * Hyperliquid execution adapter.
 *
 * Wraps @nktkas/hyperliquid SDK for placing orders, checking positions,
 * and managing the trading account. Uses API wallet (can trade, cannot withdraw).
 *
 * Ticker format: paste.trade already resolves to HL format (e.g., "NVDA", "xyz:SP500").
 * This adapter handles the coin-to-assetId mapping via the /info meta endpoint.
 */

import { HttpTransport, InfoClient, ExchangeClient } from "@nktkas/hyperliquid";
import { privateKeyToAccount } from "viem/accounts";
import { EXECUTION_CONFIG, getHlBaseUrl } from "../../config/execution.ts";

// ── Client Setup ──

function getPrivateKey(): `0x${string}` {
  const key = process.env.HL_PRIVATE_KEY?.trim();
  if (!key) throw new Error("HL_PRIVATE_KEY not set in .env");
  return (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
}

function getWalletAddress(): `0x${string}` {
  const addr = process.env.HL_API_WALLET?.trim();
  if (!addr) throw new Error("HL_API_WALLET not set in .env");
  return (addr.startsWith("0x") ? addr : `0x${addr}`) as `0x${string}`;
}

function createTransport(): HttpTransport {
  return new HttpTransport({
    isTestnet: EXECUTION_CONFIG.TESTNET,
    timeout: 15_000,
  });
}

function createInfoClient(): InfoClient {
  return new InfoClient({ transport: createTransport() });
}

function createExchangeClient(): ExchangeClient {
  const wallet = privateKeyToAccount(getPrivateKey());
  return new ExchangeClient({ transport: createTransport(), wallet });
}

// ── Asset ID Resolution ──

interface AssetMeta {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  index: number;
}

let cachedMeta: Map<string, AssetMeta> | null = null;

async function getAssetMeta(info: InfoClient): Promise<Map<string, AssetMeta>> {
  if (cachedMeta) return cachedMeta;
  const meta = await info.meta();
  const map = new Map<string, AssetMeta>();
  for (let i = 0; i < meta.universe.length; i++) {
    const asset = meta.universe[i]!;
    map.set(asset.name.toUpperCase(), {
      name: asset.name,
      szDecimals: asset.szDecimals,
      maxLeverage: asset.maxLeverage,
      index: i,
    });
  }
  cachedMeta = map;
  return map;
}

/** Strip venue prefix: "xyz:SP500" -> "SP500", "cash:HOOD" -> "HOOD" */
function stripPrefix(ticker: string): string {
  const idx = ticker.indexOf(":");
  return idx === -1 ? ticker : ticker.slice(idx + 1);
}

/** Resolve ticker to asset ID and metadata */
async function resolveAsset(ticker: string, info: InfoClient): Promise<AssetMeta> {
  const meta = await getAssetMeta(info);
  const bare = stripPrefix(ticker).replace(/-PERP$/i, "").toUpperCase();
  const asset = meta.get(bare);
  if (!asset) throw new Error(`Ticker "${ticker}" not found in Hyperliquid universe. Available: ${[...meta.keys()].slice(0, 20).join(", ")}...`);
  return asset;
}

// ── Price Helpers ──

async function getMidPrice(coin: string, info: InfoClient): Promise<number> {
  const mids = await info.allMids();
  const price = mids[coin];
  if (!price) throw new Error(`No mid price for ${coin}`);
  return parseFloat(price);
}

function roundSize(size: number, szDecimals: number): string {
  const factor = Math.pow(10, szDecimals);
  return (Math.floor(size * factor) / factor).toString();
}

function roundPrice(price: number, significantFigures: number = 5): string {
  if (price === 0) return "0";
  const magnitude = Math.floor(Math.log10(Math.abs(price)));
  const factor = Math.pow(10, significantFigures - magnitude - 1);
  return (Math.round(price * factor) / factor).toString();
}

// ── Public API ──

export interface BalanceResult {
  total: number;
  available: number;
  in_positions: number;
}

export async function getBalance(): Promise<BalanceResult> {
  const info = createInfoClient();
  const addr = getWalletAddress();
  const state = await info.clearinghouseState({ user: addr });
  const total = parseFloat(state.marginSummary.accountValue);
  const marginUsed = parseFloat(state.marginSummary.totalMarginUsed);
  return {
    total: Math.round(total * 100) / 100,
    available: Math.round((total - marginUsed) * 100) / 100,
    in_positions: Math.round(marginUsed * 100) / 100,
  };
}

export interface PositionInfo {
  ticker: string;
  direction: "long" | "short";
  size_usd: number;
  entry_price: number;
  current_price: number;
  pnl_usd: number;
  pnl_pct: number;
  leverage: number;
  liquidation_price: number | null;
}

export async function getPositions(): Promise<PositionInfo[]> {
  const info = createInfoClient();
  const addr = getWalletAddress();
  const state = await info.clearinghouseState({ user: addr });
  const mids = await info.allMids();
  const positions: PositionInfo[] = [];

  for (const ap of state.assetPositions) {
    const pos = ap.position;
    const szi = parseFloat(pos.szi);
    if (szi === 0) continue;

    const entryPrice = parseFloat(pos.entryPx ?? "0");
    const currentPrice = parseFloat(mids[pos.coin] ?? "0");
    const posValue = Math.abs(szi) * currentPrice;
    const pnl = parseFloat(pos.unrealizedPnl ?? "0");
    const pnlPct = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 * (szi > 0 ? 1 : -1) : 0;
    const liqPx = pos.liquidationPx ? parseFloat(pos.liquidationPx) : null;

    positions.push({
      ticker: pos.coin,
      direction: szi > 0 ? "long" : "short",
      size_usd: Math.round(posValue * 100) / 100,
      entry_price: entryPrice,
      current_price: currentPrice,
      pnl_usd: Math.round(pnl * 100) / 100,
      pnl_pct: Math.round(pnlPct * 100) / 100,
      leverage: typeof pos.leverage === "object" ? pos.leverage.value : 1,
      liquidation_price: liqPx,
    });
  }
  return positions;
}

export interface OrderResult {
  status: "filled" | "partial" | "resting" | "failed";
  order_id: number | null;
  fill_price: number | null;
  filled_size: number | null;
  timestamp: string;
  error?: string;
}

export async function executeMarketOrder(
  ticker: string,
  direction: "long" | "short",
  sizeUsd: number,
  leverage: number = EXECUTION_CONFIG.DEFAULT_LEVERAGE,
  slippagePct: number = EXECUTION_CONFIG.DEFAULT_SLIPPAGE_PCT,
): Promise<OrderResult> {
  // Safety checks
  if (sizeUsd > EXECUTION_CONFIG.MAX_POSITION_SIZE_USD) {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: `Position size $${sizeUsd} exceeds max $${EXECUTION_CONFIG.MAX_POSITION_SIZE_USD}` };
  }

  const info = createInfoClient();
  const exchange = createExchangeClient();

  // Check total exposure
  const positions = await getPositions();
  const totalExposure = positions.reduce((sum, p) => sum + p.size_usd, 0);
  if (totalExposure + sizeUsd > EXECUTION_CONFIG.MAX_TOTAL_EXPOSURE_USD) {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: `Total exposure would be $${totalExposure + sizeUsd}, exceeds max $${EXECUTION_CONFIG.MAX_TOTAL_EXPOSURE_USD}` };
  }

  const asset = await resolveAsset(ticker, info);
  const midPrice = await getMidPrice(asset.name, info);

  // Set leverage
  const effectiveLeverage = Math.min(leverage, asset.maxLeverage);
  await exchange.updateLeverage({
    asset: asset.index,
    isCross: true,
    leverage: effectiveLeverage,
  });

  // Calculate size in base units
  const sizeBase = sizeUsd / midPrice;
  const roundedSize = roundSize(sizeBase, asset.szDecimals);
  if (parseFloat(roundedSize) === 0) {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: `Order size too small after rounding to ${asset.szDecimals} decimals` };
  }

  // Aggressive IOC limit price with slippage
  const isLong = direction === "long";
  const slippageMultiplier = isLong ? (1 + slippagePct / 100) : (1 - slippagePct / 100);
  const limitPrice = roundPrice(midPrice * slippageMultiplier);

  const result = await exchange.order({
    orders: [{
      a: asset.index,
      b: isLong,
      p: limitPrice,
      s: roundedSize,
      r: false,
      t: { limit: { tif: "Ioc" } },
    }],
    grouping: "na",
  });

  const status = result.response.data.statuses[0];
  if (!status) {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: "No status returned from exchange" };
  }

  if (typeof status === "string") {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: `Unexpected status: ${status}` };
  }

  if ("error" in status) {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: status.error };
  }

  if ("filled" in status) {
    return {
      status: parseFloat(status.filled.totalSz) >= parseFloat(roundedSize) ? "filled" : "partial",
      order_id: status.filled.oid,
      fill_price: parseFloat(status.filled.avgPx),
      filled_size: parseFloat(status.filled.totalSz),
      timestamp: new Date().toISOString(),
    };
  }

  if ("resting" in status) {
    return {
      status: "resting",
      order_id: status.resting.oid,
      fill_price: null,
      filled_size: null,
      timestamp: new Date().toISOString(),
    };
  }

  return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: "Unknown order status" };
}

export async function executeLimitOrder(
  ticker: string,
  direction: "long" | "short",
  price: number,
  sizeUsd: number,
  leverage: number = EXECUTION_CONFIG.DEFAULT_LEVERAGE,
): Promise<OrderResult> {
  if (sizeUsd > EXECUTION_CONFIG.MAX_POSITION_SIZE_USD) {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: `Position size $${sizeUsd} exceeds max $${EXECUTION_CONFIG.MAX_POSITION_SIZE_USD}` };
  }

  const info = createInfoClient();
  const exchange = createExchangeClient();

  const positions = await getPositions();
  const totalExposure = positions.reduce((sum, p) => sum + p.size_usd, 0);
  if (totalExposure + sizeUsd > EXECUTION_CONFIG.MAX_TOTAL_EXPOSURE_USD) {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: `Total exposure would be $${totalExposure + sizeUsd}, exceeds max $${EXECUTION_CONFIG.MAX_TOTAL_EXPOSURE_USD}` };
  }

  const asset = await resolveAsset(ticker, info);

  const effectiveLeverage = Math.min(leverage, asset.maxLeverage);
  await exchange.updateLeverage({
    asset: asset.index,
    isCross: true,
    leverage: effectiveLeverage,
  });

  const sizeBase = sizeUsd / price;
  const roundedSize = roundSize(sizeBase, asset.szDecimals);
  if (parseFloat(roundedSize) === 0) {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: `Order size too small after rounding to ${asset.szDecimals} decimals` };
  }

  const result = await exchange.order({
    orders: [{
      a: asset.index,
      b: direction === "long",
      p: roundPrice(price),
      s: roundedSize,
      r: false,
      t: { limit: { tif: "Gtc" } },
    }],
    grouping: "na",
  });

  const status = result.response.data.statuses[0];
  if (!status) {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: "No status returned" };
  }

  if (typeof status === "string") {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: `Unexpected: ${status}` };
  }

  if ("error" in status) {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: status.error };
  }

  if ("filled" in status) {
    return { status: "filled", order_id: status.filled.oid, fill_price: parseFloat(status.filled.avgPx), filled_size: parseFloat(status.filled.totalSz), timestamp: new Date().toISOString() };
  }

  if ("resting" in status) {
    return { status: "resting", order_id: status.resting.oid, fill_price: null, filled_size: null, timestamp: new Date().toISOString() };
  }

  return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: "Unknown status" };
}

export async function closePosition(ticker: string): Promise<OrderResult> {
  const info = createInfoClient();
  const exchange = createExchangeClient();
  const addr = getWalletAddress();
  const state = await info.clearinghouseState({ user: addr });

  const bare = stripPrefix(ticker).replace(/-PERP$/i, "").toUpperCase();
  const position = state.assetPositions.find(ap => ap.position.coin.toUpperCase() === bare);
  if (!position) {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: `No open position for ${ticker}` };
  }

  const szi = parseFloat(position.position.szi);
  if (szi === 0) {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: `Position size is zero for ${ticker}` };
  }

  const asset = await resolveAsset(ticker, info);
  const midPrice = await getMidPrice(asset.name, info);
  const isLong = szi > 0;
  const closeSize = Math.abs(szi).toString();

  // Close = opposite direction, reduce-only, aggressive IOC
  const slippagePct = EXECUTION_CONFIG.DEFAULT_SLIPPAGE_PCT;
  const slippageMultiplier = isLong ? (1 - slippagePct / 100) : (1 + slippagePct / 100);
  const limitPrice = roundPrice(midPrice * slippageMultiplier);

  const result = await exchange.order({
    orders: [{
      a: asset.index,
      b: !isLong,
      p: limitPrice,
      s: closeSize,
      r: true,
      t: { limit: { tif: "Ioc" } },
    }],
    grouping: "na",
  });

  const status = result.response.data.statuses[0];
  if (!status) {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: "No status returned" };
  }

  if (typeof status === "string") {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: `Unexpected: ${status}` };
  }

  if ("error" in status) {
    return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: status.error };
  }

  if ("filled" in status) {
    return { status: "filled", order_id: status.filled.oid, fill_price: parseFloat(status.filled.avgPx), filled_size: parseFloat(status.filled.totalSz), timestamp: new Date().toISOString() };
  }

  return { status: "failed", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString(), error: "Order did not fill" };
}

// ── TP/SL ──

export interface TpSlResult {
  status: "placed" | "failed";
  tp_order_id?: number;
  sl_order_id?: number;
  error?: string;
}

/**
 * Place take-profit and/or stop-loss trigger orders on an existing position.
 * Uses positionTpsl grouping so orders scale with position size.
 */
export async function setTpSl(
  ticker: string,
  direction: "long" | "short",
  opts: { tp_price?: number; sl_price?: number },
): Promise<TpSlResult> {
  if (!opts.tp_price && !opts.sl_price) {
    return { status: "failed", error: "At least one of tp_price or sl_price required" };
  }

  const info = createInfoClient();
  const exchange = createExchangeClient();
  const asset = await resolveAsset(ticker, info);
  const isLong = direction === "long";

  const orders: any[] = [];

  if (opts.tp_price) {
    orders.push({
      a: asset.index,
      b: !isLong, // TP closes the position (opposite direction)
      p: roundPrice(opts.tp_price),
      s: "0", // positionTpsl ignores size, scales with position
      r: true,
      t: { trigger: { isMarket: true, triggerPx: roundPrice(opts.tp_price), tpsl: "tp" } },
    });
  }

  if (opts.sl_price) {
    orders.push({
      a: asset.index,
      b: !isLong,
      p: roundPrice(opts.sl_price),
      s: "0",
      r: true,
      t: { trigger: { isMarket: true, triggerPx: roundPrice(opts.sl_price), tpsl: "sl" } },
    });
  }

  const result = await exchange.order({
    orders,
    grouping: "positionTpsl",
  });

  const statuses = result.response.data.statuses;
  const errors: string[] = [];
  let tpOid: number | undefined;
  let slOid: number | undefined;

  function parseStatus(s: any, label: string): number | undefined {
    if (!s) { errors.push(`${label}: no status`); return undefined; }
    // "waitingForTrigger" / "waitingForFill" = successfully placed
    if (s === "waitingForTrigger" || s === "waitingForFill") return -1; // placed, no oid yet
    if (typeof s === "object" && "resting" in s) return s.resting.oid;
    if (typeof s === "object" && "error" in s) { errors.push(`${label}: ${s.error}`); return undefined; }
    errors.push(`${label}: ${String(s)}`);
    return undefined;
  }

  let idx = 0;
  if (opts.tp_price) {
    const oid = parseStatus(statuses[idx], "TP");
    if (oid !== undefined) tpOid = oid === -1 ? undefined : oid;
    idx++;
  }
  if (opts.sl_price) {
    const oid = parseStatus(statuses[idx], "SL");
    if (oid !== undefined) slOid = oid === -1 ? undefined : oid;
  }

  // Only fail if we got actual errors, not just "waiting" statuses
  if (errors.length > 0 && tpOid === undefined && slOid === undefined) {
    return { status: "failed", error: errors.join("; ") };
  }

  return { status: "placed", tp_order_id: tpOid, sl_order_id: slOid, ...(errors.length ? { error: errors.join("; ") } : {}) };
}

/**
 * Place a trailing stop that follows price by a fixed percentage.
 * Implemented as a stop-loss that you update periodically, or as a trigger order
 * at current price minus trail%.
 */
export async function setTrailingStop(
  ticker: string,
  direction: "long" | "short",
  trailPct: number,
): Promise<TpSlResult> {
  const info = createInfoClient();
  const asset = await resolveAsset(ticker, info);
  const midPrice = await getMidPrice(asset.name, info);
  const isLong = direction === "long";

  // Trail from current price
  const slPrice = isLong
    ? midPrice * (1 - trailPct / 100)
    : midPrice * (1 + trailPct / 100);

  return setTpSl(ticker, direction, { sl_price: slPrice });
}

export async function getOrderStatus(orderId: number): Promise<{ status: string; order?: any }> {
  const info = createInfoClient();
  const addr = getWalletAddress();
  const result = await info.orderStatus({ user: addr, oid: orderId });
  if (result.status === "unknownOid") {
    return { status: "unknown" };
  }
  return {
    status: result.order.status,
    order: result.order.order,
  };
}
