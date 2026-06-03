# SignalCatch

SignalCatch is a free static crypto-signal dashboard for GitHub Pages. It uses public REST APIs only and does not require a backend, account, API key, or database.

## Feature Boundary

- Bybit: current-position scanner, manual analysis, and historical backtest
- Binance: manual analysis only
- Manual cards remain visible when a setup is not recommended or an API call fails
- Backtests use closed-candle signals, delayed entry-zone fills, SL-first same-candle ordering, and non-overlapping positions by default
- Default round-trip cost: `0.11%` fee plus `0.20%` slippage
- OOS summary: the last `20%` of each mode-specific candle series is reported separately
- Daily and swing backtests simulate three split entries and three split targets with the default split profile
- Scanner default: top `100` Bybit USDT perpetuals by 24-hour turnover, editable from `10` to `200`
- Scanner search: verifies Bybit support first, reuses an existing result, or runs a one-symbol current-position scan outside the current universe
- Scanner setup summary: compact rows show symbol, current price, best setup, direction, visible recommendation badge, and expandable full timeframe details
- Manual assets: Bybit symbols are verified before a card is created; unsupported symbols show inline feedback instead of persistent error cards
- Market workflow: fixed-theme heatmap, `70%` strength plus `30%` liquidity ranking, top `5` default tiles per theme, lightweight `1H / 4H / 1D` chart, and analysis briefing
- Dashboard market context: eight cards show `BTC`, `ETH`, `BTC/ETH`, `BTC.D`, `USDT.D`, `OTHERS.D`, `OTHERS`, and `TOTAL3ES`; automated scoring uses only readable Bybit data while dominance and total-market indicators remain TradingView visual references
- Backtest laboratory: retained as an optional advanced tool inside Settings instead of the primary navigation
- Displayed prices use thousands separators and at most four decimal places for readability

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
- TradingView iframe URLs are built from a fixed allowlist only.
- External market-cap data can fail or throttle; the UI falls back to Bybit-only profile data.

## Known Temporary Limits

- Daily and swing backtests use the default split profile; per-symbol profile weights are not yet injected into historical runs.
- Common CoinGecko IDs are mapped. Unknown symbols use a lowercase fallback and may remain on Bybit-only profile data.
- `BTC.D`, `USDT.D`, `OTHERS.D`, `OTHERS`, and `TOTAL3ES` are visual reference charts in the free static build and are not read back into the automated score.
- Final CSV download-event verification must be repeated after GitHub Pages deployment.

This dashboard is an analysis tool, not financial advice.
