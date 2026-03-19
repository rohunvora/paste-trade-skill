# Codex Install and Update

## Install

Paste the repo URL into your agent:

```
https://github.com/rohunvora/paste-trade-skill
```

## Verify

1. `trade` appears in installed skills.
2. `/trade` runs without local path assumptions.
3. First run returns normal `/trade` output.

## First run

```text
/trade US power demand from AI workloads will outperform grid expectations.
```

X login is optional and should not block first run.

## Update

Paste the repo URL into your agent again:

```
https://github.com/rohunvora/paste-trade-skill
```

## Account portability

- Preferred: reuse one `PASTE_TRADE_KEY` across clients.
- To sign in to the web: run `bun run scripts/signin.ts` — opens a one-time link in your browser.
