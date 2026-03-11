# Dense Source Path — Reference Index

Every rule in `dense.md` gets an ID: `d-` prefix + section number + letter. Say "change d-4c" not "the loop-back rule in evaluate."

Companion to [skill-index.md](skill-index.md) — dense.md handles §5-§9 for dense sources.

## Sections

| #    | Title              | Lines   | What happens                                      |
| ---- | ------------------ | ------- | ------------------------------------------------- |
| d-0  | Intro              | 1-7     | Scope, routing from SKILL.md, guiding principle   |
| d-1  | Enrich             | 9-32    | Diarization, speaker identity, transcript upload  |
| d-2  | Extract            | 34-61   | First pass, decompose, batch save, thesis map     |
| d-3  | Fill this out      | 62-95   | Target JSON shape for each routed thesis          |
| d-4  | Route tree         | 96-129  | Per-thesis flow: research → evaluate → save       |
| d-5  | Research tools     | 131-140 | discover.ts, source-excerpt.ts, web search detail |
| d-6  | Instrument pref    | 141-152 | Venue ranking + caveats                           |
| d-7  | Directness         | 153-157 | direct vs derived definitions                     |
| d-8  | Route command      | 158-168 | route.ts CLI + price handling                     |
| d-9  | Narration rules    | 169-190 | derivation JSON shape + provenance rules          |
| d-10 | Update checklist   | 191-208 | Pre-save validation + save.ts --update            |

---

## d-0 Intro

| ID   | Line | Rule                                                               | Flow                      |
| ---- | ---- | ------------------------------------------------------------------ | ------------------------- |
| d-0a | 3-4  | Read when SKILL.md routes here at §5. Handles §5-§9               | in: SKILL.md classification |
| d-0b | 5    | Return to SKILL.md at §10 Post                                    | out: §10 Post             |
| d-0c | 7    | Author did the thinking. Verify, price, and narrate               | in: guiding principle     |

## d-1 Enrich

| ID   | Line  | Rule                                                               | Flow                                     |
| ---- | ----- | ------------------------------------------------------------------ | ---------------------------------------- |
| d-1a | 14    | Check title/description for multi-speaker indicators               | in: extract title + description          |
| d-1b | 15-18 | Multi-speaker + GEMINI_API_KEY → diarize.ts                       | in: multi-speaker signal + key           |
| d-1c | 19-23 | Multi-speaker, no key → offer choice (continue or get key)        | in: multi-speaker signal + missing key   |
| d-1d | 24    | Single speaker → use extract saved_to                              | in: single-speaker signal                |
| d-1e | 26-27 | Web search each named speaker's X handle                          | in: named speakers from transcript       |
| d-1f | 28    | Source author = channel, trade author_handle = quote speaker       | in: channel handle + speaker handles     |
| d-1g | 30    | upload-source-text.ts with saved_to                                | in: canonical transcript + source_id     |
| d-1h | 31    | Always read from file path, not tool output                        | in: extract/diarize output               |

## d-2 Extract

| ID   | Line  | Rule                                                               | Flow                                     |
| ---- | ----- | ------------------------------------------------------------------ | ---------------------------------------- |
| d-2a | 36    | Read canonical source artifact, find every tradeable thesis        | in: canonical transcript                 |
| d-2b | 38    | First pass: list beliefs + quote + speaker                         | in: transcript                           |
| d-2c | 41    | Decompose: what pumps hardest if the belief is right?              | in: extracted belief                     |
| d-2d | 42    | 2nd order effects                                                  | in: extracted belief                     |
| d-2e | 43    | Best trades → who entries (1-3)                                    | in: decompose output                     |
| d-2f | 44    | Use surrounding transcript context to sharpen                      | in: transcript + belief                  |
| d-2g | 46    | Think across instrument types (PM for events, HL for sectors)      | in: thesis theme                         |
| d-2h | 50-52 | batch-save.ts --total N, track every thesis ID                    | in: decomposed theses + run_id           |
| d-2i | 57-58 | stream-thought.ts thesis map to live page                         | in: thesis list + run_id                 |
| d-2j | 60    | Long transcripts: chunk if word_count > 8K or chars > 45K         | in: word_count / char count              |
| d-2k | 60    | Workers extract only; main thread merges/dedupes                   | in: chunked extraction outputs           |

## d-3 Fill this out

| ID   | Line  | Rule                                                              | Flow                                     |
| ---- | ----- | ----------------------------------------------------------------- | ---------------------------------------- |
| d-3a | 65-92 | Target JSON: route_status, who, route_evidence, derivation        | out: routing target shape                |
| d-3b | 94    | subjects[].label must match direct_checks[].subject_label         | in: validation constraint                |
| d-3c | 94    | Selected ticker must appear in who                                | in: validation constraint                |

## d-4 Route tree

| ID   | Line    | Rule                                                             | Flow                                     |
| ---- | ------- | ---------------------------------------------------------------- | ---------------------------------------- |
| d-4a | 98      | All theses route independently                                   | in: saved thesis records                 |
| d-4b | 98      | Adapter error: retry once, then alt ticker or skip               | in: adapter failure                      |
| d-4c | 101     | stream-thought.ts "Researching market context..." before routing | in: run_id                               |
| d-4d | 105-108 | Research: 3 tools in parallel (discover, excerpt, web search)    | in: thesis who[] + saved_to              |
| d-4e | 110-114 | Evaluate: reasoning chain check, loop back if gaps               | in: research outputs                     |
| d-4f | 114     | Pick 1-2, no redundant routes                                    | in: evaluated candidates                 |
| d-4g | 116-117 | Select expression using d-6 + d-7                                | in: candidates → d-6 + d-7              |
| d-4h | 119-120 | route.ts — price it                                              | in: selected ticker → d-8               |
| d-4i | 122-123 | Build derivation                                                 | in: research + source → d-9             |
| d-4j | 125-126 | Validate and save                                                | in: route package → d-10               |

## d-5 Research tools

| ID   | Line | Rule                                                               | Flow                                     |
| ---- | ---- | ------------------------------------------------------------------ | ---------------------------------------- |
| d-5a | 133  | discover.ts --query per who entry, --catalog for non-crypto HL     | in: thesis who[] keywords                |
| d-5b | 133  | Prefer reference_symbols matches for HIP-3                         | in: discover results                     |
| d-5c | 133  | Training data stale — search to find what's listed                 | in: agent knowledge gap                  |
| d-5d | 135  | source-excerpt.ts --query for thesis keywords                      | in: saved_to + thesis keywords           |
| d-5e | 135  | Recovers context lost during extraction split                      | in: individual thesis vs full transcript |
| d-5f | 135  | --around for exact quote expansion                                 | in: specific quote                       |
| d-5g | 137  | Web search: verify thesis, find catalysts, cite as research        | in: thesis claims                        |
| d-5h | 137  | Search for the investment thesis, not the news                     | in: search strategy                      |
| d-5i | 139  | hl-universe.md for HL upgrades, prediction-markets.md for events   | in: venue upgrade checks                 |

## d-6 Instrument preference

| ID   | Line    | Rule                                                             | Flow                                     |
| ---- | ------- | ---------------------------------------------------------------- | ---------------------------------------- |
| d-6a | 143     | Direct thesis on HL → perps                                      | in: direct thesis + HL availability      |
| d-6b | 144-145 | Sector/index with HL equivalent → HL perps                      | in: broad thesis + HL thematic           |
| d-6c | 145     | Not when author named specific company                           | in: company-specific thesis              |
| d-6d | 146-147 | Binary event with PM contract → prediction market               | in: event thesis + PM contract           |
| d-6e | 147     | Skip PM for pure price direction, no binary resolution           | in: price-direction-only thesis          |
| d-6f | 148     | Otherwise → shares                                              | in: no better derivative venue           |
| d-6g | 149     | No direct route → best proxy                                    | in: no direct executable                 |
| d-6h | 150     | Sector-level over single equities for broad theses               | in: broad thesis                         |
| d-6i | 151     | Better venue exists → route there, present original as alt       | in: venue upgrade found                  |

## d-7 Directness

| ID   | Line | Rule                                                               | Flow                                     |
| ---- | ---- | ------------------------------------------------------------------ | ---------------------------------------- |
| d-7a | 155  | direct = speaker's subject is unambiguous                          | in: source wording vs expression         |
| d-7b | 156  | derived = reasoning distance, not just whether they named a ticker | in: source wording vs expression         |

## d-8 Route command

| ID   | Line    | Rule                                                             | Flow                                     |
| ---- | ------- | ---------------------------------------------------------------- | ---------------------------------------- |
| d-8a | 161-164 | route.ts --run-id --thesis-id TICKER direction --source-date --horizon | in: selected ticker + thesis context |
| d-8b | 167     | Use tool prices directly, do not recompute                       | in: route price_context                  |
| d-8c | 167     | routed_ticker from output → ticker in route_evidence             | in: route selected_expression            |

## d-9 Narration rules

| ID   | Line    | Rule                                                             | Flow                                     |
| ---- | ------- | ---------------------------------------------------------------- | ---------------------------------------- |
| d-9a | 172-183 | Derivation JSON: explanation + segments + steps                  | out: derivation object                   |
| d-9b | 175     | Segments: speaker attribution with name + handle                 | in: speaker identity from d-1e           |
| d-9c | 185     | 2-5 steps, earn the conclusion                                   | in: reasoning chain                      |
| d-9d | 186     | Provenance: segment = sourced, url = researched, neither = inference | in: step fields                      |
| d-9e | 187     | Include timestamps from transcript                               | in: transcript timestamps                |
| d-9f | 188     | Can cite context from source-excerpt                             | in: d-5d/d-5e recovered context          |
| d-9g | 189     | Short chain if speaker named ticker; earn it if routing leaped   | in: direct vs derived distance           |

## d-10 Update checklist

| ID    | Line | Rule                                                               | Flow                                     |
| ----- | ---- | ------------------------------------------------------------------ | ---------------------------------------- |
| d-10a | 195  | who[] updated to final routed ticker + direction                   | in: route output                         |
| d-10b | 196  | route_status = "routed"                                            | in: routing success                      |
| d-10c | 197  | subjects[].label ↔ direct_checks[].subject_label match            | in: cross-reference validation           |
| d-10d | 198  | Selected ticker appears in who                                     | in: who[] vs selected_expression         |
| d-10e | 199  | instrument/platform strings match route output exactly             | in: route strings                        |
| d-10f | 200  | Proxy: fallback_reason_tag present                                 | in: proxy route selection                |
| d-10g | 201  | derivation includes explanation, segments, and steps               | in: narration output                     |
| d-10h | 204  | save.ts --update with who + route_evidence + derivation            | in: validated route package              |
| d-10i | 207  | Emits thesis_routed or thesis_dropped automatically                | out: live page update                    |
