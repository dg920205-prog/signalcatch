# SignalCatch Market Heatmap And Chart Briefing Design

## Goal

Improve the scanner setup readability and replace the unfinished auxiliary
surface with a focused market workflow:

`theme heatmap -> asset selection -> lightweight chart -> briefing -> setup`

Keep historical backtesting available as an advanced tool, but remove it from
the primary navigation because current-position analysis is the main use case.

## Scope

### Included

- Format displayed prices with thousands separators and at most four decimal
  places.
- Replace dense split-plan sentences with distinct entry, SL, and TP sections.
- Remove `Backtest` from the primary tab list and expose it from
  `Settings > Advanced tools`.
- Replace the unfinished `Auxiliary` tab with a `Market` tab.
- Add a fixed theme map for Major, L1, L2, DeFi, AI, Meme, Gaming, and RWA
  assets.
- Add a heatmap that shows theme and asset strength.
- Add a lightweight chart with `1H / 4H / 1D` controls and a default of `4H`.
- Add a concise generated market briefing and the strongest setup for the
  selected asset.
- Allow users to expand the other timeframe setups when they need detail.

### Not Included

- TradingView embeds or other external chart widgets.
- Account connections, API keys, order placement, or automated trading.
- External category APIs. Theme membership stays editable in local source code
  for the first version.
- Claims that a recommendation predicts future returns.

## Navigation

The primary navigation becomes:

`Manual assets / Scanner / Market`

The backtest implementation remains intact. A new `Advanced tools` section in
the settings dialog contains an `Open backtest laboratory` button. The button
activates the hidden backtest panel. The panel includes a clear return action
so users can move back to the ordinary workflow without reopening settings.

The unfinished auxiliary placeholders are removed. Safe operational diagnostics
remain available where errors occur rather than occupying a primary tab.

## Scanner Readability

Displayed prices use locale-aware formatting with at most four decimal places:

- `0.629234` becomes `0.6292`
- `69568.4112` becomes `69,568.4112`
- `70024.0000` becomes `70,024`

Each scanner setup continues to show mode, direction, entry zone, SL, TP, and
recommendation. For daily and swing setups, split guidance uses a compact
layout:

- `Entry`: E1, E2, E3 each on its own line with price and allocation badge.
- `SL`: one visually distinct red stop-loss row.
- `TP`: TP1, TP2, TP3 each on its own line with price and allocation badge.

The layout must remain readable on narrow screens through wrapping and
horizontal scrolling only where a table genuinely needs it.

## Fixed Theme Universe

The first release uses an explicit, editable theme definition. A symbol may
appear in more than one theme when that is useful for market discovery.

| Theme | Initial symbols |
| --- | --- |
| Major | BTC, ETH, SOL, XRP |
| L1 | SOL, ADA, AVAX, SUI, TON, NEAR, APT |
| L2 | ARB, OP, STRK, ZK, MNT |
| DeFi | UNI, AAVE, LINK, CRV, ONDO |
| AI | FET, RENDER, TAO, WLD |
| Meme | DOGE, SHIB, PEPE, BONK, WIF |
| Gaming | IMX, GALA, SAND, AXS |
| RWA | ONDO, LINK, MKR, POLYX |

Symbols unavailable on Bybit are isolated as unavailable tiles. They do not
prevent the rest of the heatmap from rendering.

## Heatmap Strength

Heatmap strength is an analysis score for discovery, not a trading signal.

For each symbol:

1. Load Bybit ticker data for current price, 24-hour price change, and 24-hour
   turnover.
2. Load recent hourly candles to compare the latest 24 hours of volume against
   the previous 24 hours.
3. Compare the latest 4 hours of volume against the previous 4 hours and apply a
   bounded momentum bonus when activity accelerates.
4. Combine normalized price change, 24-hour volume change, and the 4-hour
   acceleration bonus.

Theme strength is the turnover-weighted average of its available symbols.
Low-turnover outliers therefore cannot dominate a theme.

The UI shows a score plus `Strong / Neutral / Weak`. A short explanation next
to the heatmap describes the inputs without presenting the score as a promise.

## Chart Briefing

Selecting a heatmap tile loads a focused detail area:

1. Symbol and theme context.
2. Timeframe controls: `1H`, `4H`, and `1D`; default `4H`.
3. Lightweight SVG chart with:
   - recent closing-price line,
   - short and long moving-average lines,
   - recommended entry zone,
   - SL line,
   - TP line.
4. Briefing text derived from observable analysis values:
   - direction and trend strength,
   - volume condition,
   - selected mode and recommendation level,
   - entry, SL, and TP interpretation,
   - a reminder that the output is analysis rather than financial advice.
5. The highest-confidence setup as the default card.
6. An expandable `Other timeframe setups` section.

The chart briefing reuses existing analysis and recommendation functions where
possible. It does not invent certainty or fetch third-party commentary.

## Data Flow

1. Opening `Market` triggers one heatmap refresh.
2. The market service fetches theme-universe ticker data and bounded hourly
   candle history with limited concurrency.
3. The renderer displays available tiles immediately after the bounded refresh
   completes and isolates individual failures.
4. Selecting a symbol loads chart candles for the chosen timeframe and builds
   all existing setup modes for the symbol.
5. Changing `1H / 4H / 1D` reloads only the selected chart data.
6. A visible refresh button allows explicit heatmap updates. No background
   polling is required in the initial version.

## Error Handling

- API failures are isolated per symbol.
- A partially available heatmap remains usable.
- The selected detail panel shows a clear unavailable state when chart data
  cannot be loaded.
- Inputs remain public exchange requests only.
- Rendering continues to use safe DOM helpers and text nodes for API-derived
  content.

## Testing

Add focused tests for:

- four-decimal locale-aware price formatting,
- split guidance entry, SL, and TP visual separation,
- hidden backtest navigation and settings advanced-tool access,
- fixed theme definitions,
- symbol and theme score calculations,
- partial heatmap API failures,
- chart-series generation and SVG rendering,
- strongest-setup selection,
- briefing text fallbacks,
- tab accessibility contracts,
- existing scanner, manual asset, storage, and backtest regressions.

Verify locally and on GitHub Pages with a real public Bybit refresh before
claiming deployment success.
