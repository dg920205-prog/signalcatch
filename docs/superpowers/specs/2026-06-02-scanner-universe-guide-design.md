# Scanner Universe And Guide Design

## Goal

Replace the temporary seven-symbol scanner with a Bybit-first scanner that loads
USDT perpetual symbols, ranks them by 24-hour turnover, and analyzes a
user-selected top-N universe. Show actionable trade-plan values in scanner
results and include an in-page usage guide.

## Scanner Universe

- Add a Bybit public-market adapter that requests linear instrument metadata and
  linear ticker data.
- Include only symbols ending in `USDT` that are available for linear perpetual
  trading.
- Rank valid symbols by descending `turnover24h`.
- Use `100` symbols by default.
- Let the user edit the scan count between `10` and `200`.
- Keep scanner-service concurrency bounded. Do not request candles for every
  Bybit symbol when the user selected a smaller count.
- If the universe request fails, scan the existing seven-symbol fallback:
  `BTC`, `ETH`, `SOL`, `XRP`, `HBAR`, `ADA`, `DOGE`.

## Scanner Results And Current Setups

The primary scanner workflow is a current-price position setup view, not a
historical win-rate view. Keep the backtest tab available as a secondary tool,
but make scanner results actionable without opening it.

Each scanner row shows a compact summary and an expandable detail section.
The detail section lists every supported timeframe:

- common
- scalp
- day
- daily
- swing

For each timeframe, display:

- current price
- direction: bullish, bearish, or neutral
- entry zone
- SL
- TP
- recommendation label
- daily/swing split entries and split targets when available

Trade-plan values are derived from the current closed-candle analysis and the
existing trade-plan builder. Neutral rows remain visible and display `-` where a
trade plan does not exist. The existing one-click backtest action remains
available as a secondary check.

## Usage Guide

Add an expandable `How to use SignalCatch` section near the top of the page. It
explains:

1. run the scanner with the default top-100 universe or choose a different size
2. expand a symbol to read current-price setups for every timeframe
3. read direction, entry zone, TP, SL, recommendation, and split targets
4. use `Backtest` only as an optional secondary check
5. use manual assets for focused monitoring
6. treat the dashboard as an analysis tool, not an order-execution system

## Error Handling

- Keep scanner rows visible when individual candle requests fail.
- Show API unavailable status when the universe request fails, but continue with
  the seven-symbol fallback.
- Sanitize API-origin text through the existing DOM text-node helpers.
- Do not store API payloads, credentials, or exchange account information.

## Testing

- Adapter tests cover ranking, filtering, malformed turnover values, and input
  limits.
- Scanner renderer tests cover every timeframe setup, plan values, split
  guidance, recommendation fallback, and hostile values.
- DOM contract tests cover the editable universe-size control and usage guide.
- Existing full test suite remains green before deployment.
