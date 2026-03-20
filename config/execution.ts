/**
 * Execution safety config.
 *
 * All limits are hard caps enforced before any order is sent.
 * Start on testnet, flip TESTNET to false when ready for real trades.
 */

export const EXECUTION_CONFIG = {
  /** Hard cap per individual trade in USD */
  MAX_POSITION_SIZE_USD: 50,

  /** Max total exposure across all open positions in USD */
  MAX_TOTAL_EXPOSURE_USD: 500,

  /** Default leverage multiplier (2x default) */
  DEFAULT_LEVERAGE: 2,

  /** Max slippage % for market orders (IOC aggressive limit) */
  DEFAULT_SLIPPAGE_PCT: 0.5,

  /** AI must present trade summary and get user confirmation before executing */
  REQUIRE_CONFIRMATION: true,

  /** Use testnet API (free test USDC, no real money) */
  TESTNET: true,
} as const;

/** Hyperliquid API endpoints */
export const HL_ENDPOINTS = {
  mainnet: "https://api.hyperliquid.xyz",
  testnet: "https://api.hyperliquid-testnet.xyz",
} as const;

export function getHlBaseUrl(): string {
  return EXECUTION_CONFIG.TESTNET ? HL_ENDPOINTS.testnet : HL_ENDPOINTS.mainnet;
}
