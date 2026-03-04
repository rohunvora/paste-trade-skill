# Temporary Work Policy

This policy is strict and mandatory for all temporary planning, scratch notes, and in-progress artifacts.

## Canonical Temporary Workspace

Use only this folder for temporary artifacts:

- `.scratch/`

`.scratch/` is gitignored by default. It exists only for short-lived work products.

## What Must Go in `.scratch/`

- planning notes
- scratch drafts
- investigation logs
- temporary checklists
- throwaway command output captures
- any file created only to think through or stage work

## What Must Not Go in `.scratch/`

- source-of-truth documentation
- runtime code intended for release
- finalized release notes/changelog content
- policy/governance files
- credentials, keys, secrets, or private user data

## Commit Rules

1. Do not commit temporary artifacts.
2. The only allowed tracked file under `.scratch/` is `.scratch/.gitkeep`.
3. If a temporary artifact becomes durable, rewrite and move it to a proper tracked location (for example `docs/`, root policy docs, or runtime files).
4. Before every commit, verify no temporary files are staged.

## Promotion Rule

To promote temporary work into permanent docs/code:

1. Create a clean version in the destination path.
2. Remove temporary-only language and incomplete notes.
3. Validate destination content against repo scope and quality rules.
4. Keep `.scratch/` content untracked.

## Enforcement Signals

- `.gitignore` enforces ignore-by-default for `.scratch/*`.
- PR reviewers should reject changes that introduce temporary artifacts outside `.scratch/`.

## Related Files

- [`MAINTENANCE.md`](./MAINTENANCE.md)
- [`CONTRIBUTING.md`](./CONTRIBUTING.md)
