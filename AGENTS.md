# AGENTS.md

This repository ships the public `/trade` skill for `paste.trade`.

## Purpose

Keep agent behavior predictable for installed users across:
- OpenClaw
- Claude Code
- Codex

## Canonical Runtime Source

- Use [`SKILL.md`](./SKILL.md) as the canonical `/trade` runtime behavior.
- Do not rename or replace the `/trade` command.

## Runtime Guardrails

1. Keep first run unblocked:
   - X login is secondary and must not block first `/trade`.
2. Keep account portability clear:
   - preferred path is one shared `PASTE_TRADE_KEY` across clients.
   - fallback path is connect/link flow for split keys.
3. Keep OpenClaw wrapper dependency explicit:
   - `/trade` dispatch depends on `trade-slash-wrapper`.
   - setup instructions live in [`docs/install/openclaw.md`](./docs/install/openclaw.md).

## Install and Update Commands

Install:
- `npx skills add rohunvora/paste-trade-skill@v1 -a openclaw`
- `npx skills add rohunvora/paste-trade-skill@v1 -a claude-code`
- `npx skills add rohunvora/paste-trade-skill@v1 -a codex`

Update:
- `npx skills add rohunvora/paste-trade-skill@latest -a openclaw`
- `npx skills add rohunvora/paste-trade-skill@latest -a claude-code`
- `npx skills add rohunvora/paste-trade-skill@latest -a codex`

## Scope Boundary

This repo is install-critical skill/runtime/docs only.  
Do not treat it as the web app or worker app source repository.
