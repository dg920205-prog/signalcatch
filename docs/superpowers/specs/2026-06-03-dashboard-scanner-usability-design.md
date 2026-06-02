# SignalCatch Dashboard and Scanner Usability Design

## Goal

Make the free GitHub Pages dashboard usable at a glance while preserving its
Bybit-first current-position workflow. Repair the blank lightweight chart,
reduce visual sprawl, make symbol discovery reliable, and add a market context
summary without pretending that embedded TradingView data can be read by the
application.

## Confirmed Problems

1. The market detail chart has valid price points but renders blank because the
   renderer creates HTML elements named `svg` and `polyline` instead of elements
   in the SVG namespace. The resulting chart node measures `0 x 0`.
2. The scanner repeats `common`, `scalp`, `day`, `daily`, and `swing` signal
   columns even though the expandable current setup already contains the useful
   details.
3. Scanner rows include a one-click backtest action that distracts from the
   current-position purpose. Historical backtesting remains available only from
   advanced settings.
4. The scanner has no symbol search flow. Users must scroll through the scanned
   universe and cannot immediately inspect a Bybit symbol outside the current
   result list.
5. Manual assets create an error card after an unsupported or mistyped Bybit
   symbol is submitted. The application already has a Bybit symbol lookup API,
   but the manual add flow does not use it.
6. The theme heatmap renders too many wide cards at once and obscures the main
   market flow.

## Product Boundaries

- Keep deployment static and free on GitHub Pages.
- Keep Bybit as the primary exchange.
- Keep backtesting as an internal advanced tool, not a primary scanner action.
- Use TradingView embeds only for visual reference. Do not read iframe data or
  claim that embedded dominance metrics are part of the automated score.
- Preserve a clear analysis-only disclaimer. No result is a profit promise or
  investment advice.

## Main Dashboard

The dashboard prioritizes market context before individual symbols.

### Integrated Direction Banner

Show a prominent summary such as:

```text
⚠️ 혼조 · 중립 우세
자동 반영: BTC, ETH, BTC/ETH, Bybit 알트 시장 폭
시각 참고: BTC.D, USDT.D, OTHERS.D, OTHERS, TOTAL3ES
```

The automated score uses only data available to the application:

- BTC trend
- ETH trend
- BTC/ETH relative trend derived from Bybit candles
- Bybit alt-market breadth derived from refreshed USDT perpetual ticker and
  candle analysis

The following cards are visual reference indicators in the free static version:

- `BTC.D`
- `USDT.D`
- `OTHERS.D`
- `OTHERS`
- `TOTAL3ES`

The UI must label the difference between score inputs and visual references.

### Eight Context Cards

Render a responsive `4 x 2` grid on desktop and `2 x 4` grid on narrow screens:

- `BTC`
- `ETH`
- `BTC/ETH`
- `BTC.D`
- `USDT.D`
- `OTHERS.D`
- `OTHERS`
- `TOTAL3ES`

Each card includes:

- indicator name
- mini chart
- visible direction badge such as `▲ 상승`, `● 중립`, or `▼ 하락`
- one-line interpretation
- score-input or visual-reference badge

Clicking a card changes the selected large TradingView chart below the grid.
Users should not need to click every card to understand the overall direction.

### Chart Provider Boundary

Separate chart providers behind focused renderers:

- `LightweightSvgChart`: application-owned SVG chart for Bybit symbol details
- `TradingViewReferenceChart`: external embed for selected dashboard reference
  metrics

This boundary permits a later move toward broader TradingView use without
rewriting scanner or market analysis logic.

## Scanner

### Unified Symbol Search

Place a search input at the top of the scanner.

When a user submits a symbol:

1. Normalize the base symbol.
2. Query Bybit instruments to confirm a supported USDT perpetual.
3. If the symbol already exists in the scanner results, filter or focus the
   existing row.
4. If it is not in the scanned result list, run a one-symbol current-position
   scan and append the result.
5. If Bybit does not support the symbol, show a concise inline message:
   `Bybit 미지원 종목`.

The search flow must not create a persistent error card.

### Compact Scanner Table

Replace the existing wide table with:

```text
종목 | 현재가 | 최고 추천 셋업 | 방향 | 추천 상태 | 현재 셋업 보기
```

The summary row shows the best current setup selected from available
timeframes. The expandable detail contains:

- `common`
- `scalp`
- `day`
- `daily`
- `swing`
- entry zone
- stop loss
- take profit
- split entry and split take-profit guidance where available

Remove:

- repeated top-level mode signal columns
- exchange column where every scanner result is Bybit
- technical status column from normal ready rows
- row-level backtest action

Show non-ready status only when it helps explain a failure.

### Recommendation Badges

Use both icon and text:

- `✅ 추천`
- `⚠️ 주의`
- `⛔ 비추천`

Do not rely on color alone.

### Universe Size

Retain the top-symbol universe control, allowing up to `200` Bybit USDT
perpetuals. Search supports one-symbol analysis outside the currently scanned
top universe. This resolves the discovery problem without loading every symbol
and every timeframe on initial scan.

## Manual Assets

Change the form into a two-step flow:

1. Search Bybit support.
2. Show a short verified result row with an `분석 추가` button.

Only create the manual asset card after explicit confirmation.

Unsupported or mistyped symbols show an inline `Bybit 미지원 종목` message and
do not remain as cards.

## Theme Heatmap

Keep the fixed theme categories. For each theme:

1. Compute the existing market-strength signal.
2. Add a normalized liquidity rank derived from 24-hour turnover.
3. Sort with a blended discovery score:
   - market strength: `70%`
   - liquidity rank: `30%`
4. Show the top `5` assets by default.
5. Allow the user to expand the theme to view all available assets.

The heatmap remains a discovery surface, not a trade-entry promise.

## Error Handling

- Chart renderer: show `차트 데이터를 불러오지 못했습니다` only when price
  points are genuinely unavailable. Valid points must render as real SVG.
- TradingView reference chart: show a compact fallback message if the external
  widget is blocked or unavailable.
- Scanner search: distinguish invalid input, Bybit unsupported symbol, network
  failure, and analysis failure.
- Manual search: distinguish unsupported symbol from network failure without
  adding an error card.
- Heatmap: preserve successful theme tiles when individual symbols fail.

## Security

- Preserve strict content security policy.
- Extend CSP only for the minimum TradingView iframe or script origins required
  by the selected embed.
- Keep all remote text rendered through safe text nodes.
- Do not include API keys in the static bundle.
- Do not read or scrape TradingView iframe internals.

## Testing

Add failing tests before implementation for:

1. SVG chart elements use the SVG namespace and produce a renderable chart.
2. Scanner rows render compact summary columns and omit backtest actions.
3. Recommendation labels include their icon badges.
4. Unified scanner search validates Bybit support and appends a one-symbol scan.
5. Existing scanner results can be focused without rescanning.
6. Manual search requires explicit confirmation before creating a card.
7. Unsupported manual symbols produce inline feedback without persistent cards.
8. Theme sorting uses the `70 / 30` blended score and defaults to five tiles.
9. Dashboard direction calculations separate automated inputs from reference
   indicators.
10. Dashboard context cards render eight readable mini-chart summaries.

Run the full test suite, syntax checks, diff checks, security searches, local
browser verification, and public GitHub Pages verification before completion.

## Future Extension

A later phase may add:

- TradingView widgets for more symbol-detail surfaces
- a licensed TradingView chart library if its licensing and data-feed
  requirements are acceptable
- a server or proxy and an external market-data API for historical dominance
  analysis
- automatic inclusion of `BTC.D`, `USDT.D`, `OTHERS.D`, `OTHERS`, and
  `TOTAL3ES` in the integrated score once a legitimate readable data source is
  available

The present chart-provider boundary should keep those changes localized.
