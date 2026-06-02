# Security Review

## Scope

Review of the static GitHub Pages dashboard, public exchange adapters, persistence boundary, DOM rendering, backtest CSV export, and external market-profile fallback.

## Findings

1. No API keys, authorization headers, login tokens, or backend credentials are used.
2. CSP restricts scripts and styles to self-hosted assets and limits network calls to the documented public APIs.
3. API-origin content is rendered with text nodes. Dynamic HTML insertion and dynamic code execution are not used.
4. Persistence is opt-in. `js/storage.js` sanitizes and allowlists stored settings.
5. CSV output neutralizes formula-like text cells before export.
6. Public API failure details are reduced to allowlisted diagnostics without raw upstream payloads.

## Backtest Safety Assumptions

1. Signal analysis receives only candles available at the historical signal index.
2. Entry fills require a later entry-zone touch.
3. Stop loss wins when TP and SL are touched in the same candle.
4. Fees and slippage are applied as editable round-trip costs.
5. Overlapping positions are suppressed by default.
6. OOS metrics are reported separately for the last `20%` of each mode-specific candle series.

## Residual Risks

1. Daily and swing split-fill simulation uses the default split profile; per-symbol profile weights are not yet injected into historical runs.
2. Free public APIs can throttle, fail CORS checks, or change response shape.
3. Common CoinGecko IDs are mapped. Unknown symbols use a lowercase fallback and may remain on Bybit-only profile data.
4. Browser-level verification is still required after public deployment.
