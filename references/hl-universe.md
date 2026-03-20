# Hyperliquid Thematic Universe

Hyperliquid lists more than individual stocks. Its non-crypto universe includes
thematic index perps, commodity perps, FX perps, and private company valuations
— all tradeable with leverage, 24/7, no expiry.

## Why HL perps often beat equity ETFs

ETFs carry expense ratios, tracking error, contango (for commodity ETFs like USO),
and limited trading hours. An HL perp on the same underlying gives you:
- adjustable leverage (up to 20x on some instruments)
- no expiry or theta decay
- 24/7 trading
- trivial partial exits
- tighter thesis expression (you're trading the index/commodity directly)

## What's available

Use `discover.ts --catalog` for the live listing. Key categories:

**Indices** — track major ETFs as leveraged perps:
- SP500 (≈ SPY/S&P 500, official xyz:SP500), USTECH/XYZ100 (≈ QQQ/Nasdaq), SMALL2000 (≈ IWM/Russell 2000)
- SEMIS (≈ SMH), BIOTECH (≈ XBI), DEFENSE (≈ SHLD/ITA), NUCLEAR (≈ NLR)
- ENERGY/USENERGY (≈ XLE), INFOTECH (≈ XLK), MAG7 (≈ MAGS), ROBOT (≈ BOTZ)
- GLDMINE (≈ GDX), USBOND (≈ TLT), URNM

**Commodities** — spot price exposure, no ETF wrapper:
- GOLD (≈ GLD), SILVER, PLATINUM, PALLADIUM
- CL/USOIL (≈ USO, WTI crude), BRENTOIL, NATGAS
- COPPER (≈ CPER)

**FX** — direct currency exposure:
- EUR, JPY

**Private valuations** — pre-IPO company exposure:
- SPACEX, OPENAI, ANTHROPIC (price = implied valuation in $B)

**Equities** — ~44 unique stocks as leveraged perps (some listed on multiple dexes):
- AAPL, AMD, AMZN, BABA, COIN, CRCL, GOOGL, HOOD, INTC,
  META, MSFT, MSTR, MU, NFLX, NVDA, ORCL, PLTR, RIVN, TSLA, TSM
- Plus international: HYUNDAI, SAMSUNG, SK HYNIX

## When to check

Before finalizing any route to a Robinhood ETF or broad-sector stock, run
`discover.ts --query "<theme>"` to see if HL has a direct equivalent.
The query works best with single concrete terms: "gold", "nuclear", "semiconductors".
Current discover results expose `reference_symbols` and `routing_note` for
HIP-3 instruments, so use those fields to confirm you are mapping to the right
ETF, benchmark, commodity, or private valuation contract.

Common patterns:
- Thesis about a sector (energy, biotech, defense) → check HL thematic indices
- Thesis about a commodity (gold, oil, copper) → check HL commodity perps
- Thesis about a macro index (S&P, Nasdaq, Russell) → check HL index perps
- Thesis about an asset (Bitcoin via IBIT/MSTR) → check if asset trades directly on HL
- Thesis about a specific stock → check if stock has an HL equity perp

If the HL instrument tracks the same underlying, prefer it over the ETF.
If it's a loose thematic proxy (e.g., single solar stock → ENERGY index), note the
mismatch — the author's thesis may be company-specific, not sector-level.
