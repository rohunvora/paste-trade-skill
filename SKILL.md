---
name: trade
description: Converts directional claims into executable trade expressions and posts live output to paste.trade. Use when the user says "/trade", "trade this", "what's the trade", or asks for a concrete expression of a market view.
metadata:
  openclaw:
    homepage: https://github.com/rohunvora/paste-trade-skill/blob/main/docs/install/openclaw.md
    requires:
      bins:
        - bun
command-dispatch: tool
command-tool: trade_slash_dispatch
---

# /trade

Use `/trade` to turn thesis text or source URLs into routed trade expressions.

Runtime wiring:
- `command-dispatch: tool` keeps `/trade` on OpenClaw tool dispatch.
- `command-tool: trade_slash_dispatch` must stay stable for the wrapper plugin.

## Defaults

- Risk budget: `$100,000`
- Prefer direct expressions first.
- If a Hyperliquid perp is executable, prefer it.
- If no direct route exists, choose the cleanest proxy and explain why.
- End with: `Expressions, not advice. Do your own research.`

## Input Handling

1. If input is a URL, extract source text first.
2. If input is a direct thesis (no URL), skip extraction and route immediately.
3. X login is optional for first run. If X APIs are unavailable, continue with fallback extraction.

## Source-First Sequence (Required for URLs)

1. Extract metadata and text:
```bash
bun run skill/adapters/transcript/extract.ts "<url>"
```
2. Create source immediately after first metadata success:
```bash
bun run skill/adapters/board/create-source.ts '{"url":"...","title":"...","platform":"...","author_handle":"...","source_date":"..."}'
```
3. Share the live source URL once created.
4. Only then run heavier optional steps (for example diarization):
```bash
bun run skill/adapters/transcript/diarize.ts "<youtube_url>"
```
5. Upload canonical source text when available:
```bash
bun run skill/adapters/edit/upload-source-text.ts <source_id> --file <saved_to> --provider transcript
```

## Thesis Save -> Route -> Post Loop

1. Save each thesis before routing:
```bash
bun run skill/adapters/extraction/save.ts --run-id <run_id> '<thesis_json>'
```
2. Evaluate tradability/pricing:
```bash
bun run skill/adapters/assess.ts --run-id <run_id> <ticker> <long|short> --source-date "<ISO date>" --horizon "<timing>"
```
3. Update thesis with route fields if needed:
```bash
bun run skill/adapters/extraction/save.ts --run-id <run_id> --update <thesis_id> '<partial_json>'
```
4. Post each routed trade:
```bash
echo '<trade_json>' | bun run skill/adapters/board/post.ts --run-id <run_id>
```
5. Finalize source once all theses are accounted for:
```bash
echo '{"source_id":"...","source_theses":[...],"source_summary":"..."}' | bun run skill/adapters/board/finalize-source.ts --run-id <run_id>
```

## Account and Key Behavior

- Preferred path: reuse one `PASTE_TRADE_KEY` across all clients.
- First `/trade` run auto-creates a key if none exists.
- If separate keys already exist, run account connect flow:
```bash
bun run skill/adapters/board/connect.ts
```

## Output Contract

- Keep chat summary concise.
- Include execution lines with ticker, direction, instrument, platform, entry context.
- If a source URL exists, include it once.
- Do not present output as advice.
