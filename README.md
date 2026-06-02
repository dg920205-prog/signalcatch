# SignalCatch

SignalCatch is a free static crypto-signal dashboard for GitHub Pages. It uses public REST APIs only and does not require a backend, account, API key, or database.

## Feature Boundary

- Bybit: manual analysis, scanner, and historical backtest
- Binance: manual analysis only
- Manual cards remain visible when a setup is not recommended or an API call fails
- Backtests use closed-candle signals, delayed entry-zone fills, SL-first same-candle ordering, and non-overlapping positions by default
- Default round-trip cost: `0.11%` fee plus `0.20%` slippage
- OOS summary: the last `20%` of each mode-specific candle series is reported separately
- Daily and swing backtests simulate three split entries and three split targets with the default split profile

## Local Preview

Run the dependency-free static preview server from this directory:

```powershell
npm.cmd run preview
```

Then open the URL printed by the server.

## GitHub Pages

Publish the static files from the repository root on the `main` branch. In GitHub repository settings, select `Pages`, choose deployment from a branch, and select `/ (root)`.

## Security

- No credentials are stored or transmitted.
- Persistence is opt-in and allowlisted.
- API-origin text is rendered through DOM text nodes.
- External market-cap data can fail or throttle; the UI falls back to Bybit-only profile data.

## Known Temporary Limits

- Daily and swing backtests use the default split profile; per-symbol profile weights are not yet injected into historical runs.
- Common CoinGecko IDs are mapped. Unknown symbols use a lowercase fallback and may remain on Bybit-only profile data.
- Final CSV download-event verification must be repeated after GitHub Pages deployment.

This dashboard is an analysis tool, not financial advice.
