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

1. Replace temporary market-share proxy (`100 / rank`) with direct market dominance metrics.
2. Add explicit OOS split execution in engine (`in-sample` vs `out-of-sample` trade buckets).
3. Add robust retry/backoff and cache window for CoinGecko calls.
4. Add scanner-to-backtest pipeline so selected scanner candidates can be tested in one click.
5. Add UI-level mode selector for recommendation card (current mode is tab-driven).
6. Add visual equity curve from computed trades instead of placeholder polyline.
7. Add regression tests for backtest run-card content and CSV export button wiring.

## Risk Notes

1. Free external APIs can throttle or block requests; fallback messaging must remain visible.
2. Daily/swing split guidance is advisory only and not auto-order execution.
3. Backtest confidence can be overstated without strict OOS bucket reporting; this is queued above.
