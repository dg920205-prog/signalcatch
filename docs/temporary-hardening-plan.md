# Temporary Hardening Plan

## Purpose

This phase prioritizes delivery with safe fallbacks. The items below capture known temporary decisions and follow-up hardening work.

## Applied Temporary Decisions

1. Show entry zones for every manual asset card, even when quality is low.
2. Label low-confidence setups as `not-recommended` instead of hiding them.
3. Keep recommendations running when market-cap sources fail by falling back to Bybit-only profile data.
4. Apply split-entry and split-TP guidance to `daily` and `swing` first.
5. Display a backtest run card with data-source and OOS labels for operator clarity.

## Follow-Up Review Backlog

1. Repeat CSV download-event verification after public deployment; the in-app browser does not expose download events.

## Completed Hardening

1. Use direct Bybit `turnover24h` share instead of a rank proxy.
2. Fetch historical candles with each mode's configured timeframe.
3. Exclude Binance-only manual assets from Bybit backtests.
4. Calculate separate OOS buckets and display OOS win rate and return.
5. Suppress overlapping signals by default.
6. Make quick-period buttons update both start and end dates.
7. Simulate three split entries and three split targets for `daily` and `swing`.
8. Map common CoinGecko IDs and apply a retry and cache window to market-profile requests.
9. Run a scanner candidate backtest from its result row with one click.
10. Let users select the recommendation-card mode independently from the active tab.
11. Draw the equity curve from compounded closed-trade returns.
12. Cover CSV blob creation, anchor click, filename, and URL cleanup with an automated regression test.
13. Replace the temporary seven-symbol scanner with a Bybit turnover-ranked top-N universe and seven-symbol API fallback.
14. Display expandable current-price setups for every scanner timeframe, including entry zone, SL, TP, and available split guidance.
15. Add an in-page usage guide that positions backtesting as an optional secondary check.

## Risk Notes

1. Free external APIs can throttle or block requests; fallback messaging must remain visible.
2. Daily/swing split guidance is advisory only and not auto-order execution.
3. Backtest split PnL currently uses the default split profile; per-symbol profile weights remain a follow-up.
4. Unknown CoinGecko symbols use a lowercase fallback ID and may remain on Bybit-only profile data.
