# Sparse Source Path

Rules for sparse sources: tweets, user-typed theses, screenshots, single claims.
Read when SKILL.md routes here at §6. Handles extraction through routing (§6-§9).
Return to SKILL.md at §10 Post.

## Reasoning Tree

You will use the sparse source as the starting point to fill out the thesis.json by using Reasoning Tree.

Sparse source exact words become `headline_quote` and `quotes[]` never paraphrase the user's input. Your interpretation goes in `thesis`. Skip three-pass extraction. Work the tree below.



## Fill this out

```json
{
  "route_status": "routed",
  "who": [{ "ticker": "<final ticker>", "direction": "long|short" }],
  "route_evidence": {
    "subjects": [{ "label": "<asset name>", "subject_kind": "asset|company|event" }],
    "direct_checks": [
      {
        "subject_label": "<asset name>",
        "ticker_tested": "<final ticker>",
        "executable": true,
        "author_price": "<from route price_context>"
      }
    ],
    "selected_expression": {
      "ticker": "<final ticker>",
      "direction": "long|short",
      "instrument": "perps|shares|polymarket",
      "platform": "hyperliquid|robinhood|polymarket",
      "trade_type": "direct|derived",
      "author_price": "<from route price_context>"
    }
  },
  "derivation": { "explanation": "...", "segments": [...], "steps": [...] }
}
```

Validation: every `subjects[].label` needs a matching `direct_checks[].subject_label`, and the selected ticker must appear in `who`.



## Classify

Before entering the tree, classify the source:

| Type | Pattern | Action |
|------|---------|--------|
| **Direct call** | Ticker named with clear direction | Skip SEARCH. Go straight to SAVE → ROUTE. |
| **Implied thesis** | Claim exists but ticker needs interpretation | Full tree below with SEARCH. |
| **Breaking news** | Time-sensitive, obvious asset impact | Read `references/fast.md` and follow it. |
| **Multi-ticker list** | Multiple independent theses listed | Each is a separate thesis. Named tickers skip SEARCH individually. |
| **Pair trade** | Author names both legs explicitly | Two trades. Route both. |
| **Vague** | No directional claim | One web search to test. If nothing, finalize with no trades. |

For replies: extract.ts returns `replied_to_tweet` with parent context. Combine reply + parent text, then classify.
For image tweets: read `image_files` first, then classify based on the full picture.

## List detection

If the source lists items that need independent reasoning chains — distinct
commodities, opposing directions, or unrelated tickers — each is a separate
thesis. Items that share the same belief and catalyst are one thesis with
multiple `who` entries. Extract all theses, save with `batch-save --total N`,
then run the tree below per thesis.

## Take the original source and run this process:

```
SPARSE SOURCE
│
├─ CLASSIFY (see table above)
│  Direct call → skip to SAVE, then ROUTE (no SEARCH)
│  Breaking news → Read fast.md. Returns to SKILL.md §10 Post.
│  Vague → one web search. If nothing, finalize. No trades.
│  All others → continue below.
│
├─ What is the person actually saying?
│  ├─ What are they NOT saying that it sounds like?
│  └─ Translate into hypothesis.
│
├─ Decompose
│  ├─ Is the subject company/asset itself publicly traded?
│  │   If yes → always include as a `who` candidate.
│  ├─ What pumps hardest if the hypothesis is right?
│  ├─ What are the 2nd order effects?
│  └─ What are the best possible trades? → `who` entries (1-3)
│
├─ SAVE
│  echo '[{...}]' | batch-save.ts --run-id <run_id> --total <N>
│  Track thesis ID for route.ts and save --update.
│  stream-thought.ts --run-id <run_id> "Researching..."
│
├─ SEARCH (only for unnamed tickers) ←──────────────┐
│  discover.ts --query "<term>" for unnamed tickers   │
│    only. If the author wrote a $cashtag or named     │
│    the ticker, skip discover for that ticker.        │
│    One discover per thesis max — if the first found  │
│    the instrument, stop.                             │
│    Prefer reference_symbols matches for HIP-3.       │
│    --catalog for full non-crypto HL listing.         │
│  discover.ts --query "<event/catalyst keywords>"     │
│    --platform polymarket                              │
│    For event-driven theses only, not price trades.   │
│    Use the event noun, not the ticker.               │
│  Web search: verify thesis, find catalysts            │
│    Cite: { "text", "url", "origin": "research" }     │
│  Check hl-universe.md for HL upgrades over ETFs      │
│  Check prediction-markets.md for binary events       │
│  Search for the investment thesis, not the news       │
│                                                       │
├─ EVALUATE                                             │
│  For each candidate:                                  │
│    Reasoning chain from belief to trade?               │
│    Is there a better trade?                           │
│  If PM contract found (>$50K vol) that prices the     │
│    event/catalyst → add as separate thesis.            │
│  If gaps → loop back to SEARCH ───────────────────────┘
│  Then pick 1-3. No redundant routes.
│
├─ PICK
│  Prefer: HL perps > HL thematic > shares > proxy
│  ETF tickers: discover.ts --query "TICKER" for HL perp equivalent.
│  PM is additive: post alongside price trades, not instead of.
│  PM skip: only when no relevant contract exists.
│  Clearest reasoning chain from thesis to trade
│  Upcoming catalyst
│  Tightest link between source quote and instrument
│  direct = author recognizes it
│  derived = author didn't name it, but link is defensible
│
├─ ROUTE
│  route.ts --run-id <run_id> --thesis-id <id> TICKER direction
│    --source-date "now" --horizon "timing"
│  Use tool prices directly. Do not recompute.
│  routed_ticker from route output → ticker in route_evidence
│
├─ NARRATE
│  explanation: 1-2 sentences, plain English, no em dashes
│  segments: [{ quote: "user's words", speaker: "user" }]
│  steps: 2-3, earn the conclusion
│    every step must advance the chain. if you can
│    remove it and the conclusion still follows, cut it
│    has segment → sourced from quote
│    has url or [1](url) → backed by research
│    has neither → your inference (be honest)
│
├─ UPDATE
│  save.ts --update <id> with:
│    who + route_status + route_evidence + derivation
│  Keep instrument/platform strings exactly as returned.
│  If proxy: include fallback_reason_tag.
│  Emits thesis_routed automatically.
│
└─ Return to SKILL.md §10 Post
```



