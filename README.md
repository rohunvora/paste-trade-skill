# paste.trade

Can an AI read what someone said about markets and turn it into a tracked, auditable trade?

This repo is the reasoning engine. [paste.trade](https://paste.trade) is where the results live.

## The experiment

Someone says something about markets. A tweet, a podcast clip, an article, a hunch typed into a terminal. An AI agent reads it, extracts every tradeable thesis, researches instruments, picks the best expression for each, explains its reasoning, and locks the price.

Then we wait. Live P&L tracks from that moment forward. Was the AI's interpretation right? Did it pick a better instrument than the author implied? You can check. Every trade is public, every reasoning step is visible, every price is locked.

We're running this experiment in public.

## What happens when you paste a URL

```
 tweet                          share card
┌─────────────────────┐       ┌──────────────────────────────────┐
│ @kansasangus         │       │ @kansasangus · Mar 18, 2026      │
│                      │       │                                  │
│ "Cow/calf is just    │       │ "Cow/calf is just beginning      │
│  beginning to get    │  ──>  │  to get wild"                    │
│  wild"               │       │                                  │
│                      │       │  1  Severe drought across        │
│                      │       │     Southern Plains              │
│                      │       │  2  Herd liquidation + strike    │
│                      │       │     shrink supply                │
│                      │       │  3  DBA holds cattle & grain     │
│                      │       │     exposed to same drought      │
│                      │       │                                  │
│                      │       │  DBA  LONG           +0.3%       │
│                      │       │  $26.88 → $26.97     1 day ago   │
└─────────────────────┘       └──────────────────────────────────┘
```

Two prices locked on every trade:
- **author price**: when the source was published
- **posted price**: when the AI posted the trade

No backtesting. No hypotheticals. Just: was the AI right?

## The pipeline

```
you paste a URL
    │
    ▼
read the source ── tweet, video, article, PDF, screenshot
    │
    ▼
find tradeable ideas ── 1 to 5 theses per source
    │
    ▼
research each one ── web search, instrument discovery
    │
 ┌──┼──┐
 ▼  ▼  ▼
compare candidates ── stocks, perps, prediction markets
 └──┼──┘
    │
    ▼
pick best fit, explain why, lock price
    │
    ▼
post to paste.trade ── P&L tracked from here
```

You watch it resolve live on the source page. Each thesis appears as a card, routes independently, and resolves with an explanation and price.

## What this is not

Not a trading bot. It doesn't execute.
Not a black box. Every reasoning step is visible.
Not financial advice. It's an experiment.

It's an AI that shows its work and gets graded.

## This repo vs paste.trade

```
┌─────────────────────────┐      ┌─────────────────────────────┐
│  this repo               │      │  paste.trade                 │
│                          │      │                              │
│  the reasoning engine    │      │  the accountability layer    │
│                          │      │                              │
│  reads sources           │ ───> │  tracks P&L                  │
│  extracts theses         │ ───> │  hosts source pages          │
│  researches tickers      │ ───> │  streams progress live       │
│  explains reasoning      │ ───> │  publishes share cards       │
│  posts trades            │ ───> │  ranks authors by results    │
│                          │      │                              │
│  runs in YOUR agent      │      │  anyone can verify           │
└─────────────────────────┘      └─────────────────────────────┘
```

## Install

Paste into Claude Code, Codex, or OpenClaw:

```
https://github.com/rohunvora/paste-trade-skill
```

Then:

```
/trade https://x.com/someone/status/123456789
/trade update
```

## Works with

```
sources:   tweets · youtube · podcasts · articles · PDFs · screenshots · typed hunches
venues:    Robinhood (stocks) · Hyperliquid (perps) · Polymarket (prediction markets)
```

## Prerequisites

- [Bun](https://bun.sh) runtime
- `yt-dlp` for YouTube extraction (skill offers to install on first run)
- See [env.example](env.example) for environment variables

## See it working

Live feed: [paste.trade](https://paste.trade)
How it works: [ARCHITECTURE.md](ARCHITECTURE.md)
Changelog: [paste.trade/#changelog](https://paste.trade/#changelog)

The results are public. Go look.
