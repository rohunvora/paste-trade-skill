/**
 * Shared field-coercion utilities for route summary shaping.
 *
 * Used by scripts/route.ts to extract typed fields from untyped
 * backend API responses.
 */

// -- Coercion helpers --

export function toTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );
}

export function toFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

// -- Shared response interfaces --

export interface PerpCandidate {
  full_symbol?: string;
  base_symbol?: string;
  dex?: string;
  confidence?: number;
  why?: string;
  asset_class?: string;
  theme_tags?: string[];
  instrument_description?: string;
  reference_symbols?: string[];
  search_aliases?: string[];
  routing_note?: string;
}

export interface PerpInstrument {
  available?: boolean;
  hl_ticker?: string;
  publish_price?: number;
  dex?: string;
  selection_reason?: string;
  asset_class?: string;
  theme_tags?: string[];
  instrument_description?: string;
  pricing_note?: string;
  reference_symbols?: string[];
  search_aliases?: string[];
  routing_note?: string;
  note?: string;
  candidate_perps?: PerpCandidate[];
}

export interface ShareInstrument {
  available?: boolean;
  publish_price?: number;
  note?: string;
}

// -- Routing metadata shape (shared by selected_expression and candidate_routes) --

export interface RoutingMetadata {
  dex: string | null;
  selection_reason: string | null;
  asset_class: string | null;
  theme_tags: string[];
  instrument_description: string | null;
  pricing_note: string | null;
  reference_symbols: string[];
  search_aliases: string[];
  routing_note: string | null;
}

export const EMPTY_ROUTING_METADATA: RoutingMetadata = {
  dex: null,
  selection_reason: null,
  asset_class: null,
  theme_tags: [],
  instrument_description: null,
  pricing_note: null,
  reference_symbols: [],
  search_aliases: [],
  routing_note: null,
};

/** Extract routing metadata from a PerpInstrument response. */
export function extractPerpMetadata(perps: PerpInstrument | null, routedTicker: string): RoutingMetadata {
  if (!perps) return { ...EMPTY_ROUTING_METADATA };
  return {
    dex: toTrimmedString(perps.dex)
      ?? (routedTicker.includes(":") ? routedTicker.split(":")[0]!.trim() : "default"),
    selection_reason: toTrimmedString(perps.selection_reason),
    asset_class: toTrimmedString(perps.asset_class),
    theme_tags: toStringArray(perps.theme_tags),
    instrument_description: toTrimmedString(perps.instrument_description),
    pricing_note: toTrimmedString(perps.pricing_note),
    reference_symbols: toStringArray(perps.reference_symbols),
    search_aliases: toStringArray(perps.search_aliases),
    routing_note: toTrimmedString(perps.routing_note),
  };
}

/** Extract routing metadata from a candidate perp. */
export function extractCandidateMetadata(candidate: PerpCandidate): Omit<RoutingMetadata, "pricing_note" | "selection_reason"> & {
  confidence: number | null;
  why: string | null;
} {
  return {
    dex: toTrimmedString(candidate.dex),
    confidence: typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
      ? candidate.confidence
      : null,
    why: toTrimmedString(candidate.why),
    asset_class: toTrimmedString(candidate.asset_class),
    theme_tags: toStringArray(candidate.theme_tags),
    instrument_description: toTrimmedString(candidate.instrument_description),
    reference_symbols: toStringArray(candidate.reference_symbols),
    search_aliases: toStringArray(candidate.search_aliases),
    routing_note: toTrimmedString(candidate.routing_note),
  };
}

// -- Shared candidate extraction --

export interface CandidateRoute {
  routed_ticker: string;
  base_symbol: string | null;
  dex: string | null;
  confidence: number | null;
  why: string | null;
  asset_class: string | null;
  theme_tags: string[];
  instrument_description: string | null;
  reference_symbols: string[];
  search_aliases: string[];
  routing_note: string | null;
}

export function toCandidateRoutes(perps: PerpInstrument | null): CandidateRoute[] {
  const candidates = Array.isArray(perps?.candidate_perps) ? perps!.candidate_perps : [];
  return candidates
    .map((candidate) => {
      const routedTicker = typeof candidate?.full_symbol === "string" ? candidate.full_symbol.trim() : "";
      if (!routedTicker) return null;
      return {
        routed_ticker: routedTicker,
        base_symbol: toTrimmedString(candidate.base_symbol),
        ...extractCandidateMetadata(candidate),
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
}

// -- Shared instrument coercion --

export function toPerpInstrument(value: unknown): PerpInstrument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as PerpInstrument;
}

export function toShareInstrument(value: unknown): ShareInstrument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as ShareInstrument;
}
