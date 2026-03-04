# Maintenance Guide

Internal maintainer guardrails for this repository.

Temporary artifact policy is defined in [`TEMPORARY_WORK_POLICY.md`](./TEMPORARY_WORK_POLICY.md).

## Mission

Keep this repository a clean public skill package for `paste.trade` `/trade`:
- install
- run
- update

Optimize for:
1. Future users getting a reliable first run.
2. Contributors making safe, low-drift changes.

## Scope

Include only public install-critical assets:
- `SKILL.md`
- `skill/` runtime adapters required by `/trade`
- `openclaw-plugin/` wrapper plugin files
- install/update docs
- governance/release docs (`CHANGELOG.md`, `SECURITY.md`, `CONTRIBUTING.md`, release notes templates, migration report)

Exclude:
- web app and worker app code
- local data/memory snapshots
- private notes/dev artifacts
- editor folders and local environment dumps
- archived references not needed for runtime

If unsure, prefer excluding and document as optional.

## Temporary Workspace Rule

All temporary planning/scratch artifacts must live in `.scratch/` only.

- `.scratch/*` is ignored by default.
- `.scratch/.gitkeep` is the only allowed tracked file in that folder.
- Temporary artifacts must never be committed as source-of-truth docs.

## Non-Negotiables

1. Keep command name `/trade` unchanged.
2. Keep public naming as `paste.trade` / `paste-trade-skill`.
3. Do not add user-facing legacy naming.
4. Do not commit secrets.
5. Do not make OpenClaw wrapper setup implicit.

## Install and Update Contract

These commands must remain accurate and consistent across docs.

Install:
- `npx skills add rohunvora/paste-trade-skill@v1 -a openclaw`
- `npx skills add rohunvora/paste-trade-skill@v1 -a claude-code`
- `npx skills add rohunvora/paste-trade-skill@v1 -a codex`

Update:
- `npx skills add rohunvora/paste-trade-skill@latest -a openclaw`
- `npx skills add rohunvora/paste-trade-skill@latest -a claude-code`
- `npx skills add rohunvora/paste-trade-skill@latest -a codex`

OpenClaw requirement:
- Wrapper/plugin setup must be explicit.
- `trade-slash-wrapper` dependency must be documented.
- Setup script path must be documented and verified.

## Docs Sync Rules

If install/update commands change, update all:
- `README.md`
- `docs/install/openclaw.md`
- `docs/install/claude-code.md`
- `docs/install/codex.md`

If wrapper behavior changes, update:
- `docs/install/openclaw.md`
- `README.md`
- `scripts/setup-openclaw-wrapper.sh` (if needed)

## Portability Rules

Docs must keep this guidance:
- Preferred: reuse one `PASTE_TRADE_KEY` across clients.
- Fallback: connect/link flow for users with split keys.
- X login is secondary and must not block first `/trade` run.

## PR Checklist

- [ ] Scope is install-critical only.
- [ ] `/trade` runtime path remains coherent.
- [ ] OpenClaw wrapper dependency remains explicit.
- [ ] Install and update commands are consistent in all required docs.
- [ ] No user-facing legacy naming.
- [ ] No secrets/private URLs leaked.
- [ ] Changelog/release notes updated when behavior changes.

## Fast Validation Commands

```bash
bash -n scripts/setup-openclaw-wrapper.sh
node --check openclaw-plugin/index.js openclaw-plugin/index-lib.mjs openclaw-plugin/trade-slash-dispatch-lib.mjs openclaw-plugin/run-trade-wrapper-lib.mjs openclaw-plugin/run-trade-wrapper.mjs
rg -n "npx skills add rohunvora/paste-trade-skill@(v1|latest) -a (openclaw|claude-code|codex)" README.md docs/install/*.md
rg -n "trade-slash-wrapper|setup-openclaw-wrapper.sh" README.md docs/install/openclaw.md
rg -n "slash-trade" README.md SKILL.md docs CHANGELOG.md CONTRIBUTING.md SECURITY.md
rg -n "(PASTE_TRADE_KEY=|X_BEARER_TOKEN=|GEMINI_API_KEY=|stk_live_|BEGIN PRIVATE KEY)" .
```
