#!/usr/bin/env bun
/**
 * Execute a trade on Hyperliquid.
 *
 * Usage:
 *   echo '{"ticker":"BTC","direction":"long","size_usd":50}' | bun run scripts/execute.ts
 *   bun run scripts/execute.ts '{"ticker":"NVDA","direction":"short","size_usd":25,"leverage":2}'
 *
 * Input JSON:
 *   ticker        — HL ticker (from route.ts, e.g., "NVDA", "xyz:SP500", "BTC")
 *   direction     — "long" or "short"
 *   size_usd      — position size in USDC
 *   leverage      — leverage multiplier (default: 2)
 *   order_type    — "market" or "limit" (default: "market")
 *   limit_price   — required for limit orders
 *   slippage_pct  — max slippage for market orders (default: 0.5)
 *   tp_price      — take-profit trigger price (optional)
 *   sl_price      — stop-loss trigger price (optional)
 *   trail_pct     — trailing stop as % from entry (optional, alternative to sl_price)
 *
 * Output JSON:
 *   status, order_id, fill_price, filled_size, timestamp, tp_sl?, error?
 */

import {
  executeMarketOrder,
  executeLimitOrder,
  setTpSl,
  setTrailingStop,
} from "../adapters/hyperliquid/execute.ts";
import { EXECUTION_CONFIG } from "../config/execution.ts";

interface ExecuteInput {
  ticker: string;
  direction: "long" | "short";
  size_usd: number;
  leverage?: number;
  order_type?: "market" | "limit";
  limit_price?: number | null;
  slippage_pct?: number;
  tp_price?: number;
  sl_price?: number;
  trail_pct?: number;
}

let raw = process.argv[2];
if (!raw?.trim()) {
  raw = await Bun.stdin.text();
}
if (!raw?.trim()) {
  console.error("Usage: bun run scripts/execute.ts '<JSON>' (or pipe via stdin)");
  process.exit(1);
}

let input: ExecuteInput;
try {
  input = JSON.parse(raw.trim());
} catch {
  console.error(`Invalid JSON: ${raw.slice(0, 200)}`);
  process.exit(1);
}

if (!input.ticker || !input.direction || !input.size_usd) {
  console.error("Required fields: ticker, direction, size_usd");
  process.exit(1);
}

if (input.direction !== "long" && input.direction !== "short") {
  console.error(`Invalid direction: "${input.direction}". Use "long" or "short".`);
  process.exit(1);
}

const leverage = input.leverage ?? EXECUTION_CONFIG.DEFAULT_LEVERAGE;
const orderType = input.order_type ?? "market";
const slippage = input.slippage_pct ?? EXECUTION_CONFIG.DEFAULT_SLIPPAGE_PCT;

const extras: string[] = [];
if (input.tp_price) extras.push(`TP=$${input.tp_price}`);
if (input.sl_price) extras.push(`SL=$${input.sl_price}`);
if (input.trail_pct) extras.push(`trail=${input.trail_pct}%`);
const extrasStr = extras.length ? ` [${extras.join(", ")}]` : "";

console.error(`[execute] ${orderType.toUpperCase()} ${input.direction} ${input.ticker} $${input.size_usd} @ ${leverage}x${extrasStr}${EXECUTION_CONFIG.TESTNET ? " (TESTNET)" : ""}`);

try {
  let result;
  if (orderType === "limit") {
    if (!input.limit_price) {
      console.log(JSON.stringify({ status: "failed", error: "limit_price required for limit orders", order_id: null, fill_price: null, filled_size: null, timestamp: new Date().toISOString() }));
      process.exit(0);
    }
    result = await executeLimitOrder(input.ticker, input.direction, input.limit_price, input.size_usd, leverage);
  } else {
    result = await executeMarketOrder(input.ticker, input.direction, input.size_usd, leverage, slippage);
  }

  // If order filled and TP/SL requested, place trigger orders
  let tpSlResult = null;
  if ((result.status === "filled" || result.status === "partial") && (input.tp_price || input.sl_price || input.trail_pct)) {
    try {
      if (input.trail_pct && !input.sl_price) {
        // Trailing stop: set SL at entry - trail%
        console.error(`[execute] Setting trailing stop at ${input.trail_pct}% from current price`);
        tpSlResult = await setTrailingStop(input.ticker, input.direction, input.trail_pct);
        // Also set TP if requested
        if (input.tp_price) {
          const tpResult = await setTpSl(input.ticker, input.direction, { tp_price: input.tp_price });
          tpSlResult = { ...tpSlResult, tp_order_id: tpResult.tp_order_id };
        }
      } else {
        console.error(`[execute] Setting TP/SL orders`);
        tpSlResult = await setTpSl(input.ticker, input.direction, {
          tp_price: input.tp_price,
          sl_price: input.sl_price,
        });
      }
      if (tpSlResult.error) {
        console.error(`[execute] TP/SL warning: ${tpSlResult.error}`);
      }
    } catch (err) {
      console.error(`[execute] TP/SL failed: ${err instanceof Error ? err.message : String(err)}`);
      tpSlResult = { status: "failed", error: err instanceof Error ? err.message : String(err) };
    }
  }

  const output: any = { ...result };
  if (tpSlResult) output.tp_sl = tpSlResult;
  console.log(JSON.stringify(output, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    order_id: null,
    fill_price: null,
    filled_size: null,
    timestamp: new Date().toISOString(),
  }, null, 2));
}
