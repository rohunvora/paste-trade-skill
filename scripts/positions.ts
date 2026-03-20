#!/usr/bin/env bun
/**
 * Check Hyperliquid account balance and open positions.
 *
 * Usage:
 *   bun run scripts/positions.ts
 *   bun run scripts/positions.ts --close NVDA   # close a specific position
 *
 * Output JSON:
 *   balance: { total, available, in_positions }
 *   positions: [{ ticker, direction, size_usd, entry_price, current_price, pnl_usd, pnl_pct, leverage }]
 */

import { getBalance, getPositions, closePosition } from "../adapters/hyperliquid/execute.ts";
import { EXECUTION_CONFIG } from "../config/execution.ts";

const args = process.argv.slice(2);

if (args[0] === "--close" && args[1]) {
  const ticker = args[1];
  console.error(`[positions] Closing position: ${ticker}${EXECUTION_CONFIG.TESTNET ? " (TESTNET)" : ""}`);
  try {
    const result = await closePosition(ticker);
    console.log(JSON.stringify(result, null, 2));
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
  process.exit(0);
}

console.error(`[positions] Fetching account state${EXECUTION_CONFIG.TESTNET ? " (TESTNET)" : ""}...`);

try {
  const [balance, positions] = await Promise.all([getBalance(), getPositions()]);
  console.log(JSON.stringify({ balance, positions }, null, 2));
} catch (error) {
  console.error(`[positions] Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
