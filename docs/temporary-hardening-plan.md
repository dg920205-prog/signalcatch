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

1. Add scanner-to-backtest pipeline so selected scanner candidates can be tested in one click.
2. Add UI-level mode selector for recommendation card (current mode is tab-driven).
3. Add visual equity curve from computed trades instead of placeholder polyline.
4. Add browser-level regression coverage for CSV download wiring.

## Completed Hardening

1. Use direct Bybit `turnover24h` share instead of a rank proxy.
2. Fetch historical candles with each mode's configured timeframe.
3. Exclude Binance-only manual assets from Bybit backtests.
4. Calculate separate OOS buckets and display OOS win rate and return.
5. Suppress overlapping signals by default.
6. Make quick-period buttons update both start and end dates.
7. Simulate three split entries and three split targets for `daily` and `swing`.
8. Map common CoinGecko IDs and apply a retry and cache window to market-profile requests.

## Risk Notes

1. Free external APIs can throttle or block requests; fallback messaging must remain visible.
2. Daily/swing split guidance is advisory only and not auto-order execution.
3. Backtest split PnL currently uses the default split profile; per-symbol profile weights remain a follow-up.
4. Unknown CoinGecko symbols use a lowercase fallback ID and may remain on Bybit-only profile data.
