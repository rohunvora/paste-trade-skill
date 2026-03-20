# Claude Code Install and Update

## Install

Paste the repo URL into your agent:

```
https://github.com/rohunvora/paste-trade-skill
```

## Permissions

On your first `/trade` run, Claude Code will ask to approve a few shell commands. Here's what they are and why:

- **`bun run scripts/*`** — the skill runs ~20 small CLI scripts during a /trade (extract, route, post, etc.). Scoped to the skill's own `scripts/` directory, not arbitrary shell access.
- **`command -v bun`** / **`command -v yt-dlp`** — checks if Bun and yt-dlp are installed. Standard lookups, nothing is executed.
- **`curl -fsSL https://bun.sh/install | bash`** — the official [Bun installer](https://bun.sh). Only runs if Bun isn't already on your machine.

When prompted, click **"Yes, don't ask again"** and they'll stick permanently for this project. After that, /trade runs without interruption.

If you'd rather pre-approve everything upfront, add this to your project's `.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(bun run scripts/*)",
      "Bash(command -v bun)",
      "Bash(command -v yt-dlp)",
      "Bash(curl -fsSL https://bun.sh/install | bash)"
    ]
  }
}
```

## Verify

1. `trade` appears in installed skills.
2. `/trade` is recognized.
3. First run returns normal `/trade` output.

## First run

```text
/trade Meta will benefit from open-source AI distribution.
```

No login required — the skill auto-provisions your identity on first run.

## Update

Paste the repo URL into your agent again:

```
https://github.com/rohunvora/paste-trade-skill
```

See [Account portability](../../README.md#account-portability) for multi-client key sharing and web sign-in.
