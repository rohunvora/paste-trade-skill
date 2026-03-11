/** Resolve "now" sentinel to actual ISO 8601 datetime.
 *  LLM agents pass "now" because they don't know the exact current time. */
export function resolveNowSentinel(date: string | null | undefined): string | null {
  if (date === "now") return new Date().toISOString();
  return date ?? null;
}

function toRounded(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toPositivePrice(value: unknown): number | null {
  const parsed = toFiniteNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

export function pricesRoughlyEqual(
  left: number | null | undefined,
  right: number | null | undefined,
  tolerance = 0.01,
): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return Math.abs(left - right) <= tolerance;
}

export function computeSincePublishedMovePct(
  publishPrice: unknown,
  createdAtPrice: unknown,
): number | null {
  const publish = toPositivePrice(publishPrice);
  const created = toPositivePrice(createdAtPrice);
  if (publish == null || created == null) return null;
  const pct = toRounded(((created / publish) - 1) * 100, 2);
  return Math.abs(pct) < 0.005 ? 0 : pct;
}

export interface CanonicalTradePricingInput {
  publish_price?: unknown;
  source_date_price?: unknown;
  created_at_price?: unknown;
  since_published_move_pct?: unknown;
}

export interface CanonicalTradePricing {
  publish_price: number | null;
  source_date_price: number | null;
  created_at_price: number | null;
  since_published_move_pct: number | null;
}

export function canonicalizeTradePricing(input: CanonicalTradePricingInput): CanonicalTradePricing {
  const sourceDatePrice = toPositivePrice(input.source_date_price);
  const publishPriceInput = toPositivePrice(input.publish_price);
  const createdAtPrice = toPositivePrice(input.created_at_price);
  const publishPrice = sourceDatePrice ?? publishPriceInput;
  const computedSincePublishedMovePct = computeSincePublishedMovePct(publishPrice, createdAtPrice);
  const fallbackSincePublishedMovePct = toFiniteNumber(input.since_published_move_pct);

  return {
    publish_price: publishPrice,
    source_date_price: sourceDatePrice,
    created_at_price: createdAtPrice,
    since_published_move_pct: computedSincePublishedMovePct ?? fallbackSincePublishedMovePct,
  };
}
