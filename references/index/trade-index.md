# Trade Data Index

Every piece of information the skill collects, what it's called, when it's set, when it changes, and where it goes.

When a term is ambiguous, this file is the canonical reference.

Post everything flat at root level — the backend splits fields into DB columns vs a `trade_data` JSON blob automatically. The skill never needs to nest fields in a `trade_data` wrapper.

Companion to [skill-index.md](skill-index.md).

## The three phases

| Phase | What happens | Sections |
|-------|-------------|----------|
| **Ingestion** | Read the source and extract every belief worth trading | §3-§6 |
| **Resolution** | For each belief, find the best instrument and explain why | §7-§9 (sparse: handled in sparse.md) |
| **Output** | Assemble trade cards and post them | §10-§12 |

---

## About the source

| # | Field | What it is | Set when | Changes when | Used in |
|---|-------|-----------|----------|-------------|---------|
| 1 | `url` / `source_url` | Link to the original content (tweet URL, YouTube link, article). Called `url` in create-source.ts, `source_url` in post.ts (§11) | You run extract.ts (§4) | Never | Everything downstream |
| 2 | `title` | Title of the source material | Extracted from page/video (§4) | Enrichment may improve it (§5) | Trade card, source page |
| 3 | `platform` | Where the content lives — youtube, x, substack, podcast, pdf | You classify the input (§3) | Never | Trade card attribution |
| 4 | `source_date` | When the source was published. **Must include time** — date-only resolves to midnight UTC and gives wrong prices | Extracted from source metadata (§4), or current datetime for user-typed theses (§3) | Enrichment fills it if extract missed it (§5) | Price lookup at that moment (§9), trade card |
| 5 | `source_images` | Thumbnail or screenshot URLs from the source | Extracted from page/video (§4) | Never | Trade card |
| 6 | `word_count` | How many words in the source text | Extracted (§4) | Never | Decides chunking for dense sources (dense.md) |
| 7 | `duration_seconds` | How long the video/audio is, in seconds | Extracted (§4) | Never | Chat UX timing expectation (dense.md) |

## About the author

| # | Field | What it is | Set when | Changes when | Used in |
|---|-------|-----------|----------|-------------|---------|
| 8 | `author_handle` | The person who published the source — their X/social handle | Extracted from source (§4) | Enrichment resolves it via web search if missing (§5) | Trade card attribution (§10) |
| 9 | `author_platform` | The content platform, NOT the trading platform. "youtube" not "robinhood" | You classify the input (§3) | Never | Trade card attribution (§10). **Not the same as trading `platform`** |
| 10 | `speaker_handle` | Guest speaker X handles (podcasts/interviews only) | Enrichment + diarization (§5, dense.md) | Never | Per-trade attribution in narration (§8) |
| 11 | `speakers` | Names of all speakers identified in multi-speaker content | Enrichment + diarization (§5, dense.md) | Never | Source page, narration segments (§8) |

## About each belief (thesis)

| # | Field | What it is | Set when | Changes when | Used in |
|---|-------|-----------|----------|-------------|---------|
| 12 | `thesis` | One-sentence summary of what the author believes, **in your words not theirs**. Their exact words go in `quotes` | You extract it from the source (§6) | Never | Trade card headline, resolution input |
| 13 | `direction` | Which way the author thinks it goes — long or short | You extract it (§6) in `who[].direction` | Overwritten when you pick the final instrument (§7/§9) | Trade card, post payload (§10) |
| 14 | `quotes` | Exact verbatim words from the source that anchor this belief. Array of strings | You extract them (§6) | Never. These are frozen | Trade card, narration segments (§8) |
| 15 | `headline_quote` | The single best quote, max 120 chars. Must be an exact substring of one `quotes[]` entry | You pick it during extraction (§6) | Never. Frozen. post.ts validates exact match | Trade card headline (§10) |
| 16 | `horizon` | How long the author thinks this plays out — "by Q2", "next 3 months" | You extract it (§6) | Never | Routing input only — passed to route.ts `--horizon` for pricing window (§9). Not displayed on trade cards |
| 17 | `who` | Initial trade ideas before research. **These are starting points, not decisions.** 1-3 entries | You brainstorm them during extraction (§6). Each has `ticker` + `direction` | **Overwritten entirely** when you pick the final instrument (§7/§9). After update, `who` contains only the routed ticker | Resolution uses as search seeds (§7), then post reads final pick (§10) |
| 18 | `why` | Why the author believes this — reasoning steps in their words, plus your research | You extract author reasoning (§6) | You add research citations during resolution: `{ "text", "url", "origin": "research" }` | Narration steps (§8) |
| 19 | `thesis_id` | Unique ID for this belief, returned by save.ts | save.ts or batch-save.ts assigns it (§6) | Never | route.ts --thesis-id, save --update, post.ts, finalize (§7-§12) |
| 20 | `route_status` | Has this belief been matched to a tradeable instrument yet? | Set to `"unrouted"` at extraction (§6) | Changed to `"routed"` when you save the final instrument (§9) | Controls whether this thesis gets posted (§10) or listed as unrouted (§12) |
| 21 | `unrouted_reason` | If no trade found, why not | Set to `"pending_route_check"` at extraction (§6) | Changed to real reason if routing fails: "no clean liquid instrument", "weak directional expression" | Finalization accounting (§12). Must not be "pending_route_check" at finalization |

## About the instrument (found during resolution)

| # | Field | What it is | Set when | Changes when | Used in |
|---|-------|-----------|----------|-------------|---------|
| 22 | `ticker` | The final tradeable symbol you picked. If route.ts returned a `routed_ticker`, use that | route.ts returns it (§9) | Never after routing | Trade card (§10). Goes into `who[].ticker` and `selected_expression.ticker` |
| 23 | `instrument` | What kind of financial product — perps, shares, or polymarket | route.ts returns it (§9) | Never | Trade card (§10). **Note:** route.ts returns `"shares"` but older code says `"stock"` — use what route.ts returns |
| 24 | `platform` | Where to execute the trade — hyperliquid, robinhood, or polymarket | route.ts returns it (§9) | Never | Trade card (§10). **Not the same as `author_platform`** |
| 25 | `trade_type` | Did the author name this ticker, or did you find it through research? | **You decide this** during PICK — route.ts does NOT return it | Never | Trade card (§10). `"direct"` = author would recognize this as their trade. `"derived"` = they didn't name it but the link is defensible |
| 26 | `source_date_price` | The asset price at the exact moment the source was published. This is the P&L baseline | route.ts returns it in `price_context` (§9) | Never | Trade card P&L (§10), DB baseline. **Also stored as `publish_price`** — same number, two fields. Always pass both |
| 27 | `since_published_move_pct` | How much the price has moved since the source came out | route.ts returns it in `price_context` (§9) | Never | Trade card (§10) |
| 28 | `ticker_context` | Plain English: what is this instrument, why this one and not the obvious one | You write it during resolution (§7/§8). Stored in `trade_data` blob | Never | Trade card context block (§10). Frontend falls back to `thesis` if absent. Backend warns if missing but doesn't block |
| 28b | `hl_ticker` | The Hyperliquid-specific ticker symbol (may differ from `ticker` for HL perps) | post.ts copies from `ticker` for HL trades (§10) | Never | Frontend deeplink to Hyperliquid. Stored in `trade_data` blob |

## Route evidence (how you picked the instrument)

Pipeline-only — these fields live in `route_evidence`, stored in the extraction JSONL during the run. save.ts and post.ts validate them for routing discipline, but they never reach the database or frontend. The skill must produce them; post.ts will reject trades without valid route evidence.

| # | Field | What it is | Set when | Changes when | Used in |
|---|-------|-----------|----------|-------------|---------|
| 29 | `subjects` | The real-world things the thesis is about — companies, assets, events. Not tickers | You identify them during research (§7) | Never | Validation: every subject must have a matching direct_check |
| 30 | `direct_checks` | Which tickers you tested for each subject and whether they're tradeable | You populate from route.ts results (§9) | Never | Instrument selection, validation |
| 31 | `selected_expression` | The final pick: ticker + direction + instrument + platform + prices. Everything needed to post | You assemble it from route.ts output (§9) | Never | post.ts reads ticker, direction, instrument, platform, trade_type from here (§10) |
| 32 | `fallback_reason_tag` | If you picked a proxy instead of the obvious ticker, why | You set it if routing went indirect (§9) | Never | Validation, trade card |

For perps routes, `selected_expression` also includes HIP-3 routing metadata: `dex`, `asset_class`, `theme_tags`, `instrument_description`, `reference_symbols`, `search_aliases`, `routing_note`, `pricing_note`, `selection_reason`. These help write `ticker_context` but are not posted — they stay in route evidence only.

## Narration (the reasoning chain)

These three fields nest inside a `derivation` object: `{ explanation, segments, steps }`. Post.ts sends `derivation` as a single field (§10-§11).

| # | Field | What it is | Set when | Changes when | Used in |
|---|-------|-----------|----------|-------------|---------|
| 33 | `derivation.explanation` | 1-2 sentence summary of why this trade. Lead with the sharp insight, not background | You write it during narration (§8) | Never | Trade card, shown near the quote |
| 34 | `derivation.segments` | Source quotes tied to who said them. For user theses: `speaker: "user"` | You assemble during narration (§8) | Never | Trade card derivation display |
| 35 | `derivation.steps` | The logical chain from quote → trade. 2-5 steps. Each step is sourced, researched, or inference | You build during narration (§8) | Never | Trade card derivation display. Cite research as `[1](url)` |

## Polymarket-specific (only for prediction market trades)

| # | Field | What it is | Set when | Changes when | Used in |
|---|-------|-----------|----------|-------------|---------|
| 36 | `market_question` | The question the contract is asking | route.ts returns it (§9) | Never | Trade card |
| 37 | `buy_price_usd` | Cost per YES contract, 0 to 1 (e.g. $0.35 = 35% implied probability) | route.ts returns it (§9) | Never | Trade card. This IS the `publish_price` for PM trades |
| 38 | `market_slug` | URL-safe identifier for the Polymarket market page | route.ts returns it (§9) | Never | Trade card deeplink |
| 39 | `volume_usd` | How much money is trading on this contract | route.ts returns it (§9) | Never | Liquidity flag. Flag < $1K as low-liquidity |
| 40 | `end_date` | When the contract resolves | route.ts returns it (§9) | Never | Trade card. This is NOT `source_date` |
| 41 | `condition_id` | Polymarket's internal contract identifier | route.ts returns it (§9) | Never | Live price lookup by backend |
| 41b | `market_implied_prob` | Implied probability derived from `buy_price_usd` (e.g. $0.35 = 35%) | Backend computes from buy price at POST time | Never | Frontend price reference for PM trades. Stored in `trade_data` blob |

## Output-only (assembled at post time)

| # | Field | What it is | Set when | Changes when | Used in |
|---|-------|-----------|----------|-------------|---------|
| 42 | `source_summary` | One-line summary of the whole source, especially for grouped sources | You write it at finalization (§12) | Never | Source page |
| 43 | `source_theses` | Every belief you found — routed and unrouted. Every thesis ID must appear exactly once | You assemble at finalization (§12) | Never | Finalization accounting. No drops, no duplicates |
| 44 | `alt_venues` | Other ways to trade this if not on primary platform | route.ts returns alternatives (§9) | Never | Trade card |
| 45 | `kills` | What would disprove this thesis | You identify during research (§7) | Never | Trade card |
| 45b | `price_ladder` | Sorted price levels with labels (support, resistance, targets). Optional | You may produce during resolution (§7) | Never | Frontend renders as price visualization. Stored in `trade_data` blob |

## Run identifiers (set by skill, threaded through pipeline)

| # | Field | What it is | Set when | Changes when | Used in |
|---|-------|-----------|----------|-------------|---------|
| 46 | `run_id` | Unique ID for this /trade session, threads through every script call | create-source.ts assigns it (§4) | Never | Every script: `--run-id` flag |
| 47 | `source_id` | Unique ID for the source page. Skill passes it to post.ts and finalize-source.ts | create-source.ts assigns it (§4) | Never | post.ts, finalize-source.ts (§10) |

## Backend-managed (skill doesn't set these)

| # | Field | What it is | Set when | Changes when | Used in |
|---|-------|-----------|----------|-------------|---------|
| 48 | `trade_id` | Unique identifier for the posted trade | Backend assigns on POST | Never | Everything |
| 49 | `user_id` | Who submitted this trade run | From auth token | Never | Ownership |
| 50 | `author_id` | Internal ID for the author | Backend resolves from handle | Never | Author page |
| 51 | `created_at` | When the trade was posted to paste.trade | Auto timestamp on POST | Never | Feed ordering |
| 52 | `created_at_price` | The asset price at the moment we posted (not when the source was published) | Backend fetches live price on POST | Never | Honest P&L: current price vs this number |
| 53 | `ticker_id` | Internal FK to tickers table for denormalized lookups | Backend resolves from `ticker` on POST | Never | Query joins, indexes |
| 54 | `thesis_card` | LLM-generated card headline summarizing the trade | Backend backfill generates post-hoc | Never | Frontend: SourceCard, TradeCard, Trade page, Profile |
| 55 | `counter_card` | LLM-generated bear case / counterargument | Backend backfill generates post-hoc | Never | Frontend: Trade page bear-case section |

---

## Deprecated aliases (backend accepts, don't use in new code)

| Old name | Canonical name | Notes |
|----------|---------------|-------|
| `entry_price` | `publish_price` | Renamed in migration 0024. Backend silently accepts both |
| `comprehension` | `ticker_context` | Backend warns if only `comprehension` is sent without `ticker_context` |
| `routed_ticker` | `ticker` | Backend aliases `routed_ticker` → `ticker` on POST. Skill should use `ticker` directly |
| `stock` | `shares` | Old `instrument` enum value. route.ts returns `"shares"` — use that |

## Watch out: terms that mean two things

| Term | Meaning 1 | Meaning 2 | How to tell them apart |
|------|-----------|-----------|----------------------|
| `who` | Exploration candidates — rough trade ideas before research (§6) | Final routed ticker after you pick the instrument (§9) | Before `save --update`: candidates. After: final pick. Always overwrite with the winner |
| `publish_price` | DB column: price at source publication | Same number as `source_date_price` | Always pass both. route.ts returns `source_date_price`, post.ts copies it to `publish_price` |
| `platform` | Trading venue: hyperliquid, robinhood, polymarket (§9) | Content source: youtube, x, podcast (§3) | Trading venue = `platform`. Content source = `author_platform`. Never mix them |
| `direct` | `trade_type: "direct"` = author named this ticker | `direct_checks` = tickers you tested for each subject | Unrelated concepts sharing a word. `trade_type` is about authorship. `direct_checks` is about executability |
| `thesis` | The text field: one-sentence belief in your words | The JSON object: the full record with who/why/quotes/route_evidence | Context-dependent. "Save the thesis" = save the object. "Write the thesis" = write the text field |
| `instrument` | The type: perps, shares, polymarket | Generic: any tradeable financial product | In JSON fields, always means the type enum. In prose, could mean either |
| `expression` | `selected_expression`: the JSON object with final pick details | Prose: "executable expression" = any tradeable form of the thesis | In code/JSON: always the object. In prose: the concept |
| `source_url` | The original content URL (tweet, article, video) — field in post.ts payload (§11) | The paste.trade page URL — returned by create-source.ts (§4) | Same name, different values. In create-source.ts payload: `url`. In the response and post.ts: `source_url` |

## Dead columns (exist in DB schema, never populated — do not use)

`breakeven`, `price_captured_at`, `chain_steps_card`, `return_if_right_pct`. These columns exist from earlier iterations but are never set by skill, backend, or backfill. Do not populate them in new code.
