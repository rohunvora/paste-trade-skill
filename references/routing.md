# Routing

## Decision Rule

1. Try direct expression first.
2. If direct is unavailable, use a proxy only with explicit reasoning.
3. Keep route decisions consistent with saved thesis evidence.

## Route Output

- `executable`: whether a trade expression is available.
- `selected_expression`: the chosen instrument/platform/ticker. For HIP-3 routes it may also
  include `dex`, `selection_reason`, `asset_class`, `instrument_description`,
  `reference_symbols`, and `routing_note`.
- `alternatives`: other valid expressions.
- `price_context`: current/source-date pricing context.
- `candidate_routes`: proxy candidates to evaluate when direct fails. For HIP-3
  routes these may also include `why`, `asset_class`, `instrument_description`,
  `reference_symbols`, and `routing_note` so the model can see the ETF/index/theme link.
