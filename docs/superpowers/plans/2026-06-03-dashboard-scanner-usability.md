# Dashboard and Scanner Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair blank charts, simplify scanner results, add verified symbol search, compress the heatmap, and add a free static market-context dashboard with clearly separated automated and visual-reference indicators.

**Architecture:** Keep Bybit analysis application-owned and testable. Introduce SVG namespace helpers for lightweight charts, focused search coordinators for scanner and manual assets, a pure dashboard-context analysis module, and a TradingView reference renderer that only embeds visual charts. The TradingView boundary never contributes iframe data to automated scoring.

**Tech Stack:** Static HTML, CSS, JavaScript ES modules, Node built-in test runner, Bybit V5 public APIs, TradingView free iframe widgets, GitHub Pages.

---

## File Structure

### Create

- `js/ui/recommendation-badge.js`: map recommendation labels to visible icon badges.
- `js/services/scanner-search.js`: verify Bybit support, reuse existing candidates, and run one-symbol scans.
- `js/services/manual-search.js`: verify Bybit support before manual asset creation.
- `js/analysis/dashboard-context.js`: calculate the automated market-context score and eight dashboard card descriptors.
- `js/ui/dashboard-context.js`: render context banner, mini cards, and selected reference chart.
- `js/ui/tradingview.js`: build safe TradingView reference iframe URLs and render fallback-ready embeds.
- `tests/dashboard-context.test.js`: pure market-context score and card tests.
- `tests/search-services.test.js`: scanner and manual search coordinator tests.

### Modify

- `js/ui/dom.js`: add namespace-aware SVG construction and iframe-safe attributes.
- `js/ui/market.js`: use SVG namespace helper and collapsed heatmap sections.
- `js/ui/scanner.js`: replace wide result table with compact current-position summaries.
- `js/ui/manual-assets.js`: use icon badges in asset cards.
- `js/analysis/market-heatmap.js`: rank theme tiles with strength `70%` and liquidity `30%`.
- `js/services/market.js`: return ranked tiles and dashboard-ready refresh data.
- `js/app.js`: bind scanner search, manual search confirmation, dashboard context refresh, and reference chart selection.
- `index.html`: add dashboard context, scanner search, manual verification result, and minimal TradingView CSP allowance.
- `css/styles.css`: style compact scanner rows, badges, collapsed heatmap, dashboard cards, and reference chart.
- `tests/dom.test.js`: renderer and HTML contract tests.
- `tests/market.test.js`: heatmap blended ranking tests.
- `tests/services.test.js`: retain scanner regression coverage.
- `README.md`: explain dashboard score inputs, reference indicators, and verified search.

---

### Task 1: Repair Lightweight SVG Charts

**Files:**
- Modify: `js/ui/dom.js`
- Modify: `js/ui/market.js`
- Test: `tests/dom.test.js`

- [ ] **Step 1: Write the failing SVG namespace test**

Add a namespace-aware fake document assertion:

```js
test("market chart creates real SVG namespace elements", () => {
  const documentRef = createFakeDocument();
  documentRef.createElementNS = (namespaceURI, tagName) => {
    const node = new FakeNode(tagName);
    node.namespaceURI = namespaceURI;
    return node;
  };
  const dom = createDom(documentRef);
  const container = new FakeNode("section");

  renderMarketChart(container, {
    prices: [{ time: 1, value: 100 }, { time: 2, value: 102 }],
    shortAverage: [null, 101],
    longAverage: [null, 100.5],
  }, null, { dom });

  const [svg] = findNodes(container, (node) => node.tagName === "svg");
  const [polyline] = findNodes(container, (node) => node.tagName === "polyline");
  assert.equal(svg.namespaceURI, "http://www.w3.org/2000/svg");
  assert.equal(polyline.namespaceURI, "http://www.w3.org/2000/svg");
});
```

- [ ] **Step 2: Run the test and confirm the existing renderer fails**

Run:

```powershell
node --test tests/dom.test.js
```

Expected: FAIL because `dom.el("svg")` and `dom.el("polyline")` use `createElement`.

- [ ] **Step 3: Add an SVG helper**

Extend `createDom()`:

```js
function svgEl(tagName, attributes = {}, ...children) {
  const node = documentRef.createElementNS("http://www.w3.org/2000/svg", tagName);
  applyAttributes(node, attributes);
  return append(node, ...children);
}
```

Extract the current attribute loop into `applyAttributes(node, attributes)` and return `svgEl` with the existing DOM methods.

- [ ] **Step 4: Switch the market chart renderer to SVG elements**

In `renderMarketChart()` use:

```js
dom.svgEl("svg", { viewBox: "0 0 100 100", "aria-label": "Market price chart" },
  dom.svgEl("polyline", { class: "chart-price", points: points(prices) }),
  dom.svgEl("polyline", { class: "chart-short-average", points: points(chart.shortAverage ?? []) }),
  dom.svgEl("polyline", { class: "chart-long-average", points: points(chart.longAverage ?? []) }),
)
```

- [ ] **Step 5: Verify the chart renderer**

Run:

```powershell
node --test tests/dom.test.js
node --check js/ui/dom.js
node --check js/ui/market.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add js/ui/dom.js js/ui/market.js tests/dom.test.js
git commit -m "fix: render lightweight charts as real svg"
```

---

### Task 2: Add Recommendation Icon Badges and Compact Scanner Rows

**Files:**
- Create: `js/ui/recommendation-badge.js`
- Modify: `js/ui/scanner.js`
- Modify: `js/ui/manual-assets.js`
- Modify: `css/styles.css`
- Test: `tests/dom.test.js`

- [ ] **Step 1: Write failing compact scanner and badge tests**

Replace the obsolete backtest-action test with:

```js
test("scanner results show compact best setup rows without backtest actions", () => {
  const dom = createDom(createFakeDocument());
  const container = new FakeNode("section");
  const setups = {
    scalp: {
      mode: "scalp",
      direction: "bull",
      plan: { entryLow: 10, entryHigh: 11, sl: 9, tp: 13 },
      recommendation: { label: "추천" },
    },
  };

  renderScannerResults(container, [
    { symbol: "HBAR", price: 0.18, status: "ready", setups },
  ], { dom });

  const text = flattenText(container);
  assert.match(text, /HBAR/);
  assert.match(text, /0\.18/);
  assert.match(text, /scalp/);
  assert.match(text, /✅ 추천/);
  assert.doesNotMatch(text, /Backtest/);
  assert.doesNotMatch(text, /common.*scalp.*day.*daily.*swing/);
});
```

Add:

```js
test("recommendation badge maps every visible quality label", () => {
  assert.equal(recommendationBadge("추천"), "✅ 추천");
  assert.equal(recommendationBadge("주의"), "⚠️ 주의");
  assert.equal(recommendationBadge("비추천"), "⛔ 비추천");
});
```

- [ ] **Step 2: Run the tests and confirm failure**

Run:

```powershell
node --test tests/dom.test.js
```

Expected: FAIL because scanner rows still contain five mode columns and optional backtest actions.

- [ ] **Step 3: Implement recommendation badge mapping**

Create:

```js
const BADGES = {
  "추천": "✅ 추천",
  "주의": "⚠️ 주의",
  "비추천": "⛔ 비추천",
};

export function recommendationBadge(label) {
  return BADGES[label] ?? BADGES["비추천"];
}
```

- [ ] **Step 4: Render scanner summaries**

In `js/ui/scanner.js`:

- import `selectStrongestSetup` and `recommendationBadge`
- remove `onBacktest`
- select the best setup for each summary row
- render these columns only:

```js
["종목", "현재가", "최고 추천 셋업", "방향", "추천 상태", "상세"]
```

The final cell contains the existing expandable `현재 셋업 보기`.

- [ ] **Step 5: Use icon badges in manual cards and expanded setup rows**

Replace raw recommendation label output with:

```js
recommendationBadge(safeRead(recommendation, "label"))
```

- [ ] **Step 6: Add compact scanner CSS**

Add `.recommendation-badge`, `.compact-scanner-table`, and narrow-screen rules. Remove CSS assumptions tied to the deleted scanner action column.

- [ ] **Step 7: Verify renderer tests**

Run:

```powershell
node --test tests/dom.test.js
node --check js/ui/scanner.js
node --check js/ui/manual-assets.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add js/ui/recommendation-badge.js js/ui/scanner.js js/ui/manual-assets.js css/styles.css tests/dom.test.js
git commit -m "feat: simplify scanner current setup rows"
```

---

### Task 3: Add Unified Scanner Symbol Search

**Files:**
- Create: `js/services/scanner-search.js`
- Create: `tests/search-services.test.js`
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/styles.css`
- Test: `tests/dom.test.js`

- [ ] **Step 1: Write failing scanner search coordinator tests**

Create:

```js
test("scanner search reuses an existing candidate without rescanning", async () => {
  let scans = 0;
  const search = createScannerSearchService({
    searchSymbols: async () => ["HBARUSDT"],
    scanSymbols: async () => { scans += 1; return []; },
    getCandidates: () => [{ symbol: "HBAR" }],
  });

  const result = await search.search("hbar");
  assert.equal(result.kind, "existing");
  assert.equal(result.symbol, "HBAR");
  assert.equal(scans, 0);
});

test("scanner search appends a supported symbol outside the current universe", async () => {
  const search = createScannerSearchService({
    searchSymbols: async () => ["HBARUSDT"],
    scanSymbols: async () => [{ symbol: "HBAR", status: "ready" }],
    getCandidates: () => [],
  });

  const result = await search.search("HBAR");
  assert.equal(result.kind, "added");
  assert.equal(result.candidate.symbol, "HBAR");
});

test("scanner search reports unsupported Bybit symbols", async () => {
  const search = createScannerSearchService({
    searchSymbols: async () => {
      throw Object.assign(new Error("missing"), { kind: "not-found" });
    },
    scanSymbols: async () => [],
    getCandidates: () => [],
  });

  const result = await search.search("SHAHARA");
  assert.deepEqual(result, { kind: "unsupported", symbol: "SHAHARA" });
});
```

- [ ] **Step 2: Run search tests and confirm module-not-found failure**

Run:

```powershell
node --test tests/search-services.test.js
```

Expected: FAIL because `js/services/scanner-search.js` does not exist.

- [ ] **Step 3: Implement scanner search coordinator**

Create `createScannerSearchService({ searchSymbols, scanSymbols, getCandidates })`.

Behavior:

- normalize symbol with `normalizeBaseSymbol`
- call `searchSymbols(symbol)`
- reuse matching candidate from `getCandidates()`
- otherwise call `scanSymbols([symbol])`
- convert `kind === "not-found"` into `{ kind: "unsupported", symbol }`
- rethrow network and format failures for an inline error message

- [ ] **Step 4: Add scanner search markup**

In `index.html`, place above the scanner toolbar:

```html
<form id="scanner-search-form" class="inline-form">
  <label>종목 검색<input id="scanner-search-symbol" name="symbol" placeholder="HBAR" required></label>
  <button type="submit">검색 및 즉시 분석</button>
</form>
<p id="scanner-search-status" class="muted" role="status"></p>
```

- [ ] **Step 5: Bind scanner search in the app**

In `js/app.js`:

- import `searchBybitSymbols`
- create the coordinator with `scannerService.run`
- merge one-symbol results into `lastScannerCandidates` without duplicates
- render either all candidates or a focused single result
- render `Bybit 미지원 종목` for unsupported symbols

- [ ] **Step 6: Add HTML contract tests**

Assert that the scanner panel contains `scanner-search-form`, a required symbol input, and a `role="status"` message node.

- [ ] **Step 7: Verify scanner search**

Run:

```powershell
node --test tests/search-services.test.js tests/dom.test.js tests/services.test.js
node --check js/services/scanner-search.js
node --check js/app.js
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add js/services/scanner-search.js tests/search-services.test.js index.html js/app.js css/styles.css tests/dom.test.js
git commit -m "feat: add verified scanner symbol search"
```

---

### Task 4: Add Verified Manual Search Before Asset Creation

**Files:**
- Create: `js/services/manual-search.js`
- Modify: `tests/search-services.test.js`
- Modify: `index.html`
- Modify: `js/app.js`
- Modify: `css/styles.css`
- Test: `tests/dom.test.js`

- [ ] **Step 1: Write failing manual verification tests**

Append:

```js
test("manual search verifies support before explicit asset creation", async () => {
  const added = [];
  const search = createManualSearchService({
    searchSymbols: async () => ["HBARUSDT"],
    addAsset: async (asset) => { added.push(asset); return asset; },
  });

  const result = await search.verify({ symbol: "hbar", exchange: "bybit" });
  assert.equal(result.kind, "verified");
  assert.equal(result.symbol, "HBAR");
  assert.deepEqual(added, []);

  await search.confirm(result);
  assert.deepEqual(added, [{ symbol: "HBAR", exchange: "bybit" }]);
});

test("manual search reports unsupported symbols without creating cards", async () => {
  let addCalls = 0;
  const search = createManualSearchService({
    searchSymbols: async () => {
      throw Object.assign(new Error("missing"), { kind: "not-found" });
    },
    addAsset: async () => { addCalls += 1; },
  });

  const result = await search.verify({ symbol: "SHAHARA", exchange: "bybit" });
  assert.deepEqual(result, { kind: "unsupported", symbol: "SHAHARA", exchange: "bybit" });
  assert.equal(addCalls, 0);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```powershell
node --test tests/search-services.test.js
```

Expected: FAIL because manual search service is missing.

- [ ] **Step 3: Implement manual search coordinator**

Create `createManualSearchService({ searchSymbols, addAsset })` with:

- `verify({ symbol, exchange })`
- Bybit verification via `searchSymbols`
- Binance pass-through verification only when Binance is selected
- `confirm(verifiedResult)`
- unsupported result conversion without asset creation

- [ ] **Step 4: Change the manual form into search then confirm**

Add:

```html
<div id="manual-search-result" class="manual-search-result" role="status"></div>
```

Change submit button text to `종목 확인`. Render a verified row with `분석 추가`.

- [ ] **Step 5: Bind manual verification**

Replace immediate `manualService.add()` submit behavior:

- form submit calls `verify`
- confirmed result renders symbol and `분석 추가`
- confirm button calls the existing asset load flow
- unsupported symbol produces inline text and no card

- [ ] **Step 6: Verify manual search**

Run:

```powershell
node --test tests/search-services.test.js tests/dom.test.js tests/services.test.js
node --check js/services/manual-search.js
node --check js/app.js
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add js/services/manual-search.js tests/search-services.test.js index.html js/app.js css/styles.css tests/dom.test.js
git commit -m "feat: verify manual symbols before adding cards"
```

---

### Task 5: Rank and Collapse Theme Heatmap Tiles

**Files:**
- Modify: `js/analysis/market-heatmap.js`
- Modify: `js/services/market.js`
- Modify: `js/ui/market.js`
- Modify: `css/styles.css`
- Test: `tests/market.test.js`
- Test: `tests/dom.test.js`

- [ ] **Step 1: Write failing blended ranking tests**

Add:

```js
test("theme tiles rank by seventy percent strength and thirty percent liquidity", () => {
  const tiles = rankThemeTiles([
    { symbol: "FAST", score: 80, turnover24h: 10 },
    { symbol: "LIQUID", score: 55, turnover24h: 1000 },
    { symbol: "MID", score: 60, turnover24h: 500 },
  ]);

  assert.equal(tiles[0].symbol, "LIQUID");
  assert.equal(typeof tiles[0].discoveryScore, "number");
});
```

Add a DOM test with six tiles and assert five appear outside the collapsed
details section.

- [ ] **Step 2: Run tests and confirm failure**

Run:

```powershell
node --test tests/market.test.js tests/dom.test.js
```

Expected: FAIL because ranking and collapsed rendering do not exist.

- [ ] **Step 3: Implement blended discovery ranking**

Export:

```js
export function rankThemeTiles(tiles = []) {
  const ready = tiles.filter((tile) => tile?.status === "ready");
  const byTurnover = [...ready].sort((left, right) => right.turnover24h - left.turnover24h);
  const rankBySymbol = new Map(byTurnover.map((tile, index) => [
    tile.symbol,
    byTurnover.length === 1 ? 100 : 100 - (index / (byTurnover.length - 1)) * 100,
  ]));
  return [...tiles]
    .map((tile) => ({
      ...tile,
      discoveryScore: finiteOrZero(tile?.score) * 0.7 + finiteOrZero(rankBySymbol.get(tile?.symbol)) * 0.3,
    }))
    .sort((left, right) => right.discoveryScore - left.discoveryScore);
}
```

- [ ] **Step 4: Rank service output and collapse UI**

In `market.js` service, rank each theme before returning it.

In `ui/market.js`:

- show first five ranked tiles
- put remaining tiles in `<details>`
- summary text: `전체 종목 보기`

- [ ] **Step 5: Verify heatmap**

Run:

```powershell
node --test tests/market.test.js tests/dom.test.js
node --check js/analysis/market-heatmap.js
node --check js/services/market.js
node --check js/ui/market.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add js/analysis/market-heatmap.js js/services/market.js js/ui/market.js css/styles.css tests/market.test.js tests/dom.test.js
git commit -m "feat: rank and collapse theme heatmap tiles"
```

---

### Task 6: Add Dashboard Market Context Analysis

**Files:**
- Create: `js/analysis/dashboard-context.js`
- Create: `tests/dashboard-context.test.js`
- Modify: `js/services/market.js`

- [ ] **Step 1: Write failing pure context tests**

Create:

```js
test("dashboard context separates automated inputs from visual references", () => {
  const context = buildDashboardContext({
    btcCandles: risingCandles(),
    ethCandles: fallingCandles(),
    altTiles: [
      { symbol: "SOL", status: "ready", score: -40 },
      { symbol: "XRP", status: "ready", score: 20 },
    ],
  });

  assert.deepEqual(context.automatedInputs, ["BTC", "ETH", "BTC/ETH", "Bybit 알트 시장 폭"]);
  assert.deepEqual(context.referenceIndicators, ["BTC.D", "USDT.D", "OTHERS.D", "OTHERS", "TOTAL3ES"]);
  assert.equal(context.cards.length, 8);
  assert.equal(context.cards.find(({ symbol }) => symbol === "BTC.D").source, "reference");
});
```

Add assertions for bullish, bearish, and mixed labels.

- [ ] **Step 2: Run tests and confirm missing-module failure**

Run:

```powershell
node --test tests/dashboard-context.test.js
```

Expected: FAIL because module does not exist.

- [ ] **Step 3: Implement pure market-context analysis**

Implement:

- `trendScore(candles)`
- `relativeTrendScore(btcCandles, ethCandles)`
- `breadthScore(altTiles)`
- `directionLabel(score)`
- `buildDashboardContext({ btcCandles, ethCandles, altTiles })`

Return:

```js
{
  score,
  label,
  automatedInputs,
  referenceIndicators,
  cards: [
    { symbol: "BTC", source: "automated", direction, interpretation, series },
    { symbol: "ETH", source: "automated", direction, interpretation, series },
    { symbol: "BTC/ETH", source: "automated", direction, interpretation, series },
    { symbol: "BTC.D", source: "reference", direction: "reference", interpretation: "TradingView 참고 지표" },
    ...
  ],
}
```

- [ ] **Step 4: Add a lightweight dashboard-context service method**

Add `loadDashboardContext()` to the market service. It fetches:

- BTC `240` candles
- ETH `240` candles
- Bybit market ticker snapshots

Derive the Bybit alt-market breadth from non-BTC and non-ETH USDT perpetual
ticker snapshots. Do not run the full per-theme candle queue during initial
dashboard load.

Keep `refresh()` focused on the detailed theme heatmap. It may return an updated
dashboard context later only if the required lightweight inputs are already
available.

- [ ] **Step 5: Verify analysis**

Run:

```powershell
node --test tests/dashboard-context.test.js tests/market.test.js
node --check js/analysis/dashboard-context.js
node --check js/services/market.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add js/analysis/dashboard-context.js tests/dashboard-context.test.js js/services/market.js tests/market.test.js
git commit -m "feat: calculate integrated market context"
```

---

### Task 7: Render Dashboard Cards and TradingView Reference Chart

**Files:**
- Create: `js/ui/tradingview.js`
- Create: `js/ui/dashboard-context.js`
- Modify: `js/ui/dom.js`
- Modify: `index.html`
- Modify: `css/styles.css`
- Modify: `js/app.js`
- Test: `tests/dom.test.js`

- [ ] **Step 1: Write failing URL and dashboard renderer tests**

Add:

```js
test("TradingView reference URL allowlists dashboard symbols", () => {
  assert.match(tradingViewReferenceUrl("BTC.D", { compact: true }), /CRYPTOCAP%3ABTC\.D/);
  assert.throws(() => tradingViewReferenceUrl("javascript:alert(1)"), /unsupported/i);
});

test("dashboard context renders eight cards and score boundary labels", () => {
  const dom = createDom(createFakeDocument());
  const container = new FakeNode("section");
  renderDashboardContext(container, dashboardFixture(), { dom });
  const text = flattenText(container);
  assert.match(text, /자동 반영/);
  assert.match(text, /시각 참고/);
  assert.equal(findNodes(container, (node) => node.attributes.class === "market-context-card").length, 8);
});
```

- [ ] **Step 2: Run tests and confirm missing-module failure**

Run:

```powershell
node --test tests/dom.test.js
```

Expected: FAIL because dashboard renderer modules do not exist.

- [ ] **Step 3: Add safe iframe support**

In `js/ui/dom.js`, allow only the attributes required by the embed:

```js
"src", "loading", "referrerpolicy", "allowfullscreen"
```

Do not allow arbitrary HTML strings.

- [ ] **Step 4: Implement the TradingView URL allowlist**

Create a fixed mapping:

```js
const SYMBOLS = {
  "BTC": "BYBIT:BTCUSDT.P",
  "ETH": "BYBIT:ETHUSDT.P",
  "BTC/ETH": "BINANCE:BTCETH",
  "BTC.D": "CRYPTOCAP:BTC.D",
  "USDT.D": "CRYPTOCAP:USDT.D",
  "OTHERS.D": "CRYPTOCAP:OTHERS.D",
  "OTHERS": "CRYPTOCAP:OTHERS",
  "TOTAL3ES": "CRYPTOCAP:TOTAL3ES",
};
```

Build only `https://s.tradingview.com/widgetembed/` URLs with encoded mapping
values, dark theme, `240` interval, and disabled toolbar. Accept
`{ compact: true }` to produce the reduced card-sized variant while preserving
the same fixed symbol allowlist.

- [ ] **Step 5: Render cards and selected chart**

Create `renderDashboardContext(container, context, { dom, onSelect })`:

- visible summary banner
- eight responsive cards
- application-owned SVG mini charts for automated cards
- source badge for every card
- reference cards with clear `TradingView 참고` text and lazy-loaded compact
  TradingView mini iframes
- selected large iframe chart below cards

- [ ] **Step 6: Add dashboard markup and CSP**

Insert before the tab navigation:

```html
<section id="dashboard-context" class="market-context-panel" aria-label="시장 통합 방향성">
  <p class="empty-state">시장 문맥을 새로고침하면 통합 방향성이 표시됩니다.</p>
</section>
```

Extend CSP minimally:

```text
frame-src https://s.tradingview.com https://www.tradingview.com;
```

- [ ] **Step 7: Bind context rendering**

Call `marketService.loadDashboardContext()` once during initial app startup so
the main dashboard is useful without opening the Market tab. When market refresh
completes, keep rendering the detailed heatmap and optionally refresh dashboard
context in a separate lightweight request. Clicking cards changes only the
selected iframe symbol, not automated scores.

- [ ] **Step 8: Verify dashboard cards**

Run:

```powershell
node --test tests/dom.test.js tests/dashboard-context.test.js
node --check js/ui/tradingview.js
node --check js/ui/dashboard-context.js
node --check js/app.js
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add js/ui/tradingview.js js/ui/dashboard-context.js js/ui/dom.js index.html css/styles.css js/app.js tests/dom.test.js
git commit -m "feat: add dashboard market context cards"
```

---

### Task 8: Update Documentation and Verify the Complete Static App

**Files:**
- Modify: `README.md`
- Modify: `index.html`

- [ ] **Step 1: Update guide text**

Document:

- scanner symbol search behavior
- verified manual asset addition
- compact scanner setup summaries
- heatmap top-five blended ranking
- automated score inputs versus TradingView visual references
- advanced backtest location
- analysis-only warning

- [ ] **Step 2: Run full automated verification**

Run:

```powershell
npm.cmd test
node --check js/ui/dom.js
node --check js/ui/market.js
node --check js/ui/scanner.js
node --check js/ui/manual-assets.js
node --check js/ui/recommendation-badge.js
node --check js/ui/tradingview.js
node --check js/ui/dashboard-context.js
node --check js/services/scanner-search.js
node --check js/services/manual-search.js
node --check js/services/market.js
node --check js/analysis/market-heatmap.js
node --check js/analysis/dashboard-context.js
node --check js/app.js
git diff --check
rg -n "innerHTML|outerHTML|eval\\(|new Function|document\\.write|apiKey|Authorization" README.md index.html js tests docs
```

Expected: tests and syntax checks PASS. Search results may appear only in
historical plan documentation or the verification command itself.

- [ ] **Step 3: Verify locally in the in-app browser**

Use the Browser plugin and confirm:

1. refresh renders eight context cards
2. reference card click renders a visible TradingView iframe or compact fallback
3. market BTC tile renders a visible lightweight SVG chart
4. theme sections show five tiles by default and expand to all tiles
5. scanner search finds `HBAR`
6. scanner search reports an unsupported symbol inline
7. scanner rows show compact best-setup summaries with no row backtest action
8. manual Bybit search verifies before a card is created
9. unsupported manual symbols leave no error card

- [ ] **Step 4: Commit documentation**

```powershell
git add README.md index.html
git commit -m "docs: explain dashboard market context workflow"
```

- [ ] **Step 5: Push GitHub Pages deployment**

```powershell
git push origin HEAD:main
```

- [ ] **Step 6: Verify public deployment**

Verify:

```powershell
$body=(Invoke-WebRequest -UseBasicParsing "https://dg920205-prog.github.io/signalcatch/?deploy=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())").Content
if($body -notmatch 'dashboard-context' -or $body -notmatch 'scanner-search-form'){ throw 'GitHub Pages deployment is stale' }
```

Open `https://dg920205-prog.github.io/signalcatch/` in the Browser plugin and
repeat the visible chart, scanner search, and manual verification smoke checks.
