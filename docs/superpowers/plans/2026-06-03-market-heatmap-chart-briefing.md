# Market Heatmap And Chart Briefing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve SignalCatch readability and add a focused Market workflow with a theme heatmap, lightweight chart, briefing, and hidden advanced backtest access.

**Architecture:** Keep the dependency-free static GitHub Pages architecture. Add pure market-analysis helpers for fixed themes, strength scores, chart series, and strongest-setup selection; render them through the existing safe DOM layer. Reuse existing Bybit public adapters, signal analysis, and recommendation functions without adding order execution or third-party chart widgets.

**Tech Stack:** Browser ES modules, SVG, public Bybit REST API, Node built-in test runner, GitHub Pages.

---

## File Map

- Create `js/analysis/market-heatmap.js`: fixed themes, symbol score calculation, theme aggregation, strongest-setup selection, briefing generation.
- Create `js/services/market.js`: bounded public Bybit heatmap refresh and selected-symbol chart/setup loading.
- Create `js/ui/market.js`: heatmap tiles, chart controls, SVG chart, briefing, recommended setup, expandable other modes.
- Create `tests/market.test.js`: pure market calculations and service behavior.
- Modify `js/ui/scanner.js`: shared four-decimal formatting and readable split guidance.
- Create `js/ui/format.js`: locale-aware reusable price formatting.
- Modify `js/ui/manual-assets.js`: reuse shared formatting.
- Modify `index.html`: primary Market navigation, hidden Backtest panel, settings advanced tools, Market panel.
- Modify `css/styles.css`: readable setup cards, heatmap, chart, briefing, responsive rules.
- Modify `js/ui/dashboard.js`: primary tab list and hidden advanced backtest activation support.
- Modify `js/storage.js`: accept `market` as a primary persisted tab while preserving safe fallback behavior.
- Modify `js/app.js`: wire Market service, Market rendering, hidden Backtest open/return actions.
- Modify `tests/dom.test.js`, `tests/storage.test.js`: renderer, navigation, accessibility, storage regressions.
- Modify `README.md`, `docs/temporary-hardening-plan.md`: user-visible feature boundary and temporary hardening notes.

### Task 1: Shared Price Formatting And Split Guidance

**Files:**
- Create: `js/ui/format.js`
- Modify: `js/ui/scanner.js`
- Modify: `js/ui/manual-assets.js`
- Modify: `css/styles.css`
- Test: `tests/dom.test.js`

- [ ] **Step 1: Write failing DOM tests**

Add tests that require `formatPrice(69568.41129)` to return `69,568.4113`,
`formatPrice(0.629234)` to return `0.6292`, and `formatPrice(70024)` to return
`70,024`. Add a scanner renderer assertion that split guidance contains
separate `분할 진입`, `SL`, and `분할 TP` blocks with allocation badges.

- [ ] **Step 2: Verify the tests fail**

Run: `node --test tests/dom.test.js`

Expected: FAIL because `js/ui/format.js` does not exist and the split renderer
does not emit distinct guidance blocks.

- [ ] **Step 3: Add shared formatting and split-card rendering**

Create:

```js
export function formatPrice(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US", {
        maximumFractionDigits: 4,
        useGrouping: true,
      })
    : "-";
}
```

Import it from scanner and manual-asset renderers. Render daily and swing split
guidance as separate entry, SL, and TP rows with classes:
`split-section split-entry`, `split-section split-sl`, and
`split-section split-tp`.

- [ ] **Step 4: Verify the tests pass**

Run: `node --test tests/dom.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/ui/format.js js/ui/scanner.js js/ui/manual-assets.js css/styles.css tests/dom.test.js
git commit -m "feat: improve setup price and split readability"
```

### Task 2: Primary Navigation And Hidden Advanced Backtest

**Files:**
- Modify: `index.html`
- Modify: `js/ui/dashboard.js`
- Modify: `js/storage.js`
- Modify: `js/app.js`
- Modify: `tests/dom.test.js`
- Modify: `tests/storage.test.js`

- [ ] **Step 1: Write failing navigation tests**

Require the primary tabs to be `manual`, `scanner`, and `market`. Require the
backtest panel to remain present but absent from the primary tab list. Require
settings to contain `Open backtest laboratory`, and require the backtest panel
to contain `Return to market`.

- [ ] **Step 2: Verify the tests fail**

Run: `node --test tests/dom.test.js tests/storage.test.js`

Expected: FAIL because `Auxiliary` remains visible, `Market` is absent, and
Backtest is still a primary tab.

- [ ] **Step 3: Update navigation and safe tab storage**

Replace the auxiliary tab with Market. Remove the Backtest tab button while
keeping the hidden panel. Add settings advanced-tool and return buttons. Update
the dashboard tab controller and storage allowlist so `market` is a normal tab,
while `backtest` is activated only through explicit advanced-tool actions.

- [ ] **Step 4: Verify the tests pass**

Run: `node --test tests/dom.test.js tests/storage.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add index.html js/ui/dashboard.js js/storage.js js/app.js tests/dom.test.js tests/storage.test.js
git commit -m "feat: move backtest behind advanced tools"
```

### Task 3: Fixed Themes And Market Strength

**Files:**
- Create: `js/analysis/market-heatmap.js`
- Create: `tests/market.test.js`

- [ ] **Step 1: Write failing pure-analysis tests**

Add tests for:

```js
assert.deepEqual(THEMES.Major, ["BTC", "ETH", "SOL", "XRP"]);
assert.equal(calculateSymbolStrength({
  change24hPct: 5,
  volumeChange24hPct: 20,
  volumeAcceleration4hPct: 30,
}).label, "Strong");
assert.equal(calculateThemeStrength([
  { score: 80, turnover24h: 900 },
  { score: -80, turnover24h: 100 },
]).score > 0, true);
assert.equal(selectStrongestSetup(setups).mode, "daily");
```

Also require briefing output to mention direction, recommendation, and the
analysis-only warning.

- [ ] **Step 2: Verify the tests fail**

Run: `node --test tests/market.test.js`

Expected: FAIL because `js/analysis/market-heatmap.js` does not exist.

- [ ] **Step 3: Implement the pure market helpers**

Export:

```js
export const THEMES = Object.freeze({ ... });
export function calculateVolumeChange(current, previous) { ... }
export function calculateSymbolStrength(input) { ... }
export function calculateThemeStrength(symbols) { ... }
export function selectStrongestSetup(setups) { ... }
export function buildMarketBriefing({ symbol, setup, strength }) { ... }
export function buildChartSeries(candles) { ... }
```

Clamp score components before combining them. Use turnover-weighted theme
aggregation. Treat missing inputs as neutral rather than throwing.

- [ ] **Step 4: Verify the tests pass**

Run: `node --test tests/market.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/analysis/market-heatmap.js tests/market.test.js
git commit -m "feat: add fixed-theme market strength analysis"
```

### Task 4: Market Public API Service

**Files:**
- Create: `js/services/market.js`
- Modify: `js/api/bybit.js`
- Modify: `tests/api.test.js`
- Modify: `tests/market.test.js`

- [ ] **Step 1: Write failing service tests**

Require a public ticker-universe adapter to return symbol, price, turnover, and
24-hour change. Require the market service to:

- fetch bounded hourly candle history with limited concurrency,
- isolate a failed symbol while preserving successful heatmap tiles,
- calculate 24-hour volume change and 4-hour acceleration,
- load selected-symbol candles for `1H`, `4H`, and `1D`,
- build all existing recommendation modes for the selected symbol.

- [ ] **Step 2: Verify the tests fail**

Run: `node --test tests/api.test.js tests/market.test.js`

Expected: FAIL because the market ticker adapter and service do not exist.

- [ ] **Step 3: Implement the public market adapter and service**

Extend the existing Bybit adapter with a validated ticker snapshot function.
Create a market service that accepts injected Bybit functions, limits
concurrency, returns partial success, and reuses `analyzeCandles`,
`classifyModes`, and `buildRecommendation`.

- [ ] **Step 4: Verify the tests pass**

Run: `node --test tests/api.test.js tests/market.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/api/bybit.js js/services/market.js tests/api.test.js tests/market.test.js
git commit -m "feat: load public market heatmap data"
```

### Task 5: Market Heatmap, Chart, And Briefing UI

**Files:**
- Create: `js/ui/market.js`
- Modify: `index.html`
- Modify: `css/styles.css`
- Modify: `js/app.js`
- Modify: `tests/dom.test.js`

- [ ] **Step 1: Write failing renderer and contract tests**

Require:

- a `Market` panel with refresh action,
- theme sections and selectable tiles,
- score plus `Strong / Neutral / Weak`,
- `1H / 4H / 1D` buttons with `4H` selected by default,
- SVG price, moving-average, entry, SL, and TP layers,
- briefing text,
- strongest setup card,
- expandable other timeframe setups,
- safe unavailable states.

- [ ] **Step 2: Verify the tests fail**

Run: `node --test tests/dom.test.js`

Expected: FAIL because the market renderer and panel do not exist.

- [ ] **Step 3: Implement safe rendering and app wiring**

Create `js/ui/market.js` with focused rendering functions:

```js
export function renderMarketHeatmap(container, themes, options) { ... }
export function renderMarketDetail(container, detail, options) { ... }
export function renderMarketChart(container, chart, setup, { dom }) { ... }
```

Use existing safe DOM helpers for all API-derived text. Wire Market tab refresh,
tile selection, timeframe changes, hidden backtest open, and return-to-market
actions in `js/app.js`.

- [ ] **Step 4: Verify the tests pass**

Run: `node --test tests/dom.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/ui/market.js index.html css/styles.css js/app.js tests/dom.test.js
git commit -m "feat: add market heatmap and chart briefing UI"
```

### Task 6: Documentation And Full Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/temporary-hardening-plan.md`

- [ ] **Step 1: Update documentation**

Document the primary Market workflow, hidden advanced backtest access, fixed
theme categories, public API boundary, and analysis-only limitation.

- [ ] **Step 2: Run full automated verification**

Run:

```bash
npm.cmd test
node --check js/analysis/market-heatmap.js
node --check js/services/market.js
node --check js/ui/market.js
node --check js/ui/format.js
node --check js/app.js
git diff --check
rg -n "innerHTML|outerHTML|eval\\(|new Function|document\\.write|apiKey|secret|Authorization" README.md index.html js tests docs
```

Expected: all tests pass, syntax checks exit `0`, diff check exits `0`, and
security search contains only intentional tests or documentation examples.

- [ ] **Step 3: Verify local browser behavior**

Open the local preview and confirm:

1. Scanner prices show at most four decimals.
2. Daily and swing guidance clearly separate Entry, SL, and TP.
3. Primary navigation shows `Manual assets / Scanner / Market`.
4. Settings opens hidden advanced Backtest access.
5. Market refresh renders partial or complete theme heatmap data.
6. Selecting a tile renders the default `4H` SVG chart and briefing.
7. `1H / 4H / 1D` switching refreshes the chart.

- [ ] **Step 4: Commit docs**

```bash
git add README.md docs/temporary-hardening-plan.md
git commit -m "docs: explain market heatmap workflow"
```

- [ ] **Step 5: Push and verify GitHub Pages**

```bash
git push origin HEAD:main
```

Verify the public Pages URL exposes the Market tab and repeat a public heatmap
refresh plus selected-symbol chart check before claiming deployment success.
