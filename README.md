# paste.trade

Paste a source. AI finds the trade, captures the price when the author said it, tracks P&L from there.

Open source. [paste.trade](https://paste.trade) is where the trades live.

## Why this exists

You can already ask Claude "what's the trade here?" and get a smart answer. Then you close the tab and it's gone.

The pipeline in this repo is what makes it persist. It doesn't just think about the trade. It commits it to a system. Creates a source page. Saves each thesis. Posts each trade with a locked price. Pushes events to a WebSocket so you can watch it happen. Now that reasoning has a URL, a price ticking against it, and a spot on a feed next to every other trade the system has ever produced.

The LLM is the brain. The chain is what gives it a body.

## Why now

Agent skills are new. Six months ago there was no way to give an LLM a structured pipeline with real tool calls, file I/O, and API posts. It was a chatbot. Now it's a runtime.

This pipeline is six sequential tool calls where each one depends on the last: extract the source, find what's tradeable, research instruments, compare candidates, pick the best fit, post the trade. A year ago that chain would break by step three. Now it works.

Context windows matter too. A one-hour podcast is 50k tokens. That used to not fit. Now the agent reads the whole thing and finds the three tradeable moments across five speakers.

## What it does

```
 source                         trade card
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

Two prices on every trade:
- **author price**: the moment the source was published
- **posted price**: the moment the AI posted the trade

## How it works

```
paste a URL or type a thesis
    │
    ▼
read the source ── tweet, video, article, PDF, screenshot
    │
    ▼
find tradeable ideas ── 1 to 5 per source
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
post to paste.trade ── P&L tracks from here
```

## Why it's built this way

Agent skill because that's where you already are. Scripts are CLI tools because that's what LLMs can call. Streams live because you don't trust a black box. Two prices because you want to know who was early.

```
┌─────────────────────────┐      ┌─────────────────────────────┐
│  this repo               │      │  paste.trade                 │
│                          │      │                              │
│  reads sources           │ ───> │  tracks P&L                  │
│  extracts theses         │ ───> │  streams progress live       │
│  researches instruments  │ ───> │  publishes share cards       │
│  explains reasoning      │ ───> │  ranks by results            │
│                          │      │                              │
│  runs in your agent      │      │  anyone can see              │
└─────────────────────────┘      └─────────────────────────────┘
```

## Install

Paste into Claude Code, Codex, or OpenClaw:

```
https://github.com/rohunvora/paste-trade
```

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

- [Bun](https://bun.sh)
- `yt-dlp` for YouTube (skill offers to install on first run)
- [env.example](env.example) for env vars

## Links

[paste.trade](https://paste.trade) · [ARCHITECTURE.md](ARCHITECTURE.md) · [paste.trade/#changelog](https://paste.trade/#changelog)
