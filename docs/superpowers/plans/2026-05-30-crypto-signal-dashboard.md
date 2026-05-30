# Crypto Signal Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a free GitHub Pages static web app that provides a Bybit-first crypto dashboard, always-visible manually added assets, Bybit scanning, and conservative historical backtesting.

**Architecture:** Use dependency-free browser ES modules and Node's built-in test runner. Keep exchange adapters, pure analysis functions, backtest simulation, persistence, and DOM rendering separate so the historical engine can be tested without a browser and the UI can safely render external data with `textContent`.

**Tech Stack:** HTML5, CSS3, JavaScript ES modules, Node.js `node:test`, GitHub Pages, Bybit and Binance public REST APIs.

---

## File Map

```text
index.html                         Dashboard shell and accessible tab panels
css/styles.css                     Navy desktop-first responsive dashboard theme
js/app.js                          App bootstrap and event wiring
js/config.js                       Defaults for modes, costs, API URLs, and storage
js/core/symbols.js                 Symbol normalization and validation
js/core/errors.js                  Diagnostic error model and user-facing messages
js/api/http.js                     Fetch wrapper with timeout and response validation
js/api/bybit.js                    Bybit public API adapter and paginated candle loading
js/api/binance.js                  Binance manual-analysis-only public API adapter
js/analysis/indicators.js          Pure SMA, EMA, RSI, ATR, and volume helpers
js/analysis/signals.js             Common confirmation and mode classifications
js/analysis/market-regime.js       BTC and ETH regime aggregation
js/analysis/trade-plan.js          Entry zone, TP, SL, and R/R construction
js/backtest/engine.js              Historical signal replay and conservative fills
js/backtest/metrics.js             Portfolio, per-symbol, and per-mode summaries
js/backtest/csv.js                 CSV export
js/storage.js                      Opt-in localStorage persistence
js/state.js                        Small observable application state store
js/ui/dom.js                       Safe DOM construction helpers
js/ui/dashboard.js                 Summary cards, tab switching, API status
js/ui/manual-assets.js             Manual asset search, cards, diagnostics
js/ui/scanner.js                   Bybit candidate scan UI
js/ui/backtest-view.js             Backtest form, metrics, equity chart, trade table
js/ui/auxiliary.js                 Collapsible auxiliary panels
tests/*.test.js                    Node unit and integration tests
README.md                          Local use, security boundaries, GitHub Pages deploy
```

## Task 1: Establish the Static App Test Harness

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `index.html`
- Create: `css/styles.css`
- Create: `js/config.js`
- Create: `tests/config.test.js`

- [ ] **Step 1: Write the failing configuration test**

```js
// tests/config.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { BACKTEST_DEFAULTS, MODE_CONFIG } from "../js/config.js";

test("uses conservative Bybit cost defaults", () => {
  assert.equal(BACKTEST_DEFAULTS.roundTripFeePct, 0.11);
  assert.equal(BACKTEST_DEFAULTS.roundTripSlippagePct, 0.2);
});

test("defines editable mode wait candles", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(MODE_CONFIG).map(([key, value]) => [key, value.waitCandles])),
    { common: 8, scalp: 6, day: 12, daily: 6, swing: 4 },
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/config.test.js`

Expected: FAIL because `js/config.js` does not exist.

- [ ] **Step 3: Add the package metadata and configuration**

```json
{
  "name": "signalcatch-dashboard",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/*.test.js"
  }
}
```

```js
// js/config.js
export const BACKTEST_DEFAULTS = Object.freeze({
  presetDays: 90,
  roundTripFeePct: 0.11,
  roundTripSlippagePct: 0.2,
});

export const MODE_CONFIG = Object.freeze({
  common: { label: "공통 확정", interval: "60", waitCandles: 8 },
  scalp: { label: "스캘핑", interval: "15", waitCandles: 6 },
  day: { label: "단타", interval: "60", waitCandles: 12 },
  daily: { label: "데일리", interval: "240", waitCandles: 6 },
  swing: { label: "스윙", interval: "D", waitCandles: 4 },
});

export const STORAGE_KEY = "signalcatch.settings.v1";
export const BYBIT_BASE_URL = "https://api.bybit.com";
export const BINANCE_BASE_URL = "https://fapi.binance.com";
```

Create `.gitignore` with:

```text
.superpowers/
node_modules/
```

Create a minimal `index.html` with a module script pointing to `js/app.js`, and create
`css/styles.css` with root navy palette variables. Keep the shell intentionally small until
Task 9.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore index.html css/styles.css js/config.js tests/config.test.js
git commit -m "chore: establish static dashboard test harness"
```

## Task 2: Normalize and Validate Manual Symbols

**Files:**
- Create: `js/core/symbols.js`
- Create: `tests/symbols.test.js`

- [ ] **Step 1: Write the failing symbol tests**

```js
// tests/symbols.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBaseSymbol, toUsdtSymbol } from "../js/core/symbols.js";

test("normalizes HBAR inputs consistently", () => {
  assert.equal(normalizeBaseSymbol(" hbar "), "HBAR");
  assert.equal(normalizeBaseSymbol("hbarusdt"), "HBAR");
  assert.equal(toUsdtSymbol("hbar"), "HBARUSDT");
});

test("rejects unsafe symbol input", () => {
  assert.throws(() => normalizeBaseSymbol("<img src=x>"), /허용되지 않는 종목명/);
  assert.throws(() => normalizeBaseSymbol(""), /종목명을 입력/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/symbols.test.js`

Expected: FAIL because `js/core/symbols.js` does not exist.

- [ ] **Step 3: Implement strict normalization**

```js
// js/core/symbols.js
const SAFE_BASE_SYMBOL = /^[A-Z0-9]{2,20}$/;

export function normalizeBaseSymbol(input) {
  const symbol = String(input ?? "").trim().toUpperCase().replace(/USDT$/, "");
  if (!symbol) throw new Error("종목명을 입력해 주세요.");
  if (!SAFE_BASE_SYMBOL.test(symbol)) throw new Error("허용되지 않는 종목명입니다.");
  return symbol;
}

export function toUsdtSymbol(input) {
  return `${normalizeBaseSymbol(input)}USDT`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/symbols.test.js`

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit**

```bash
git add js/core/symbols.js tests/symbols.test.js
git commit -m "feat: normalize manual trading symbols"
```

## Task 3: Add API Diagnostics and Public Exchange Adapters

**Files:**
- Create: `js/core/errors.js`
- Create: `js/api/http.js`
- Create: `js/api/bybit.js`
- Create: `js/api/binance.js`
- Create: `tests/api.test.js`

- [ ] **Step 1: Write failing API classification tests**

```js
// tests/api.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { ApiDiagnosticError, classifyHttpFailure } from "../js/core/errors.js";
import { normalizeBybitKlines } from "../js/api/bybit.js";

test("classifies rate limits separately", () => {
  const error = classifyHttpFailure({ exchange: "Bybit", operation: "캔들 조회", status: 429 });
  assert.equal(error.kind, "rate-limit");
  assert.match(error.userMessage, /잠시 후/);
});

test("normalizes newest-first Bybit klines into ascending candles", () => {
  const rows = [["2000", "2", "3", "1", "2.5", "10"], ["1000", "1", "2", "0.5", "1.5", "8"]];
  assert.deepEqual(normalizeBybitKlines(rows).map((c) => c.time), [1000, 2000]);
});

test("diagnostics omit raw remote payloads", () => {
  const error = new ApiDiagnosticError("network", "연결 실패", { exchange: "Bybit", operation: "티커 조회" });
  assert.equal("payload" in error.detail, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/api.test.js`

Expected: FAIL because API files do not exist.

- [ ] **Step 3: Implement error classification and fetch wrapper**

```js
// js/core/errors.js
export class ApiDiagnosticError extends Error {
  constructor(kind, userMessage, detail = {}) {
    super(userMessage);
    this.name = "ApiDiagnosticError";
    this.kind = kind;
    this.userMessage = userMessage;
    this.detail = { ...detail, occurredAt: new Date().toISOString() };
  }
}

export function classifyHttpFailure({ exchange, operation, status }) {
  if (status === 429) {
    return new ApiDiagnosticError("rate-limit", "호출 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.", { exchange, operation, status });
  }
  return new ApiDiagnosticError("http", "거래소 요청이 실패했습니다.", { exchange, operation, status });
}
```

```js
// js/api/http.js
import { ApiDiagnosticError, classifyHttpFailure } from "../core/errors.js";

export async function fetchJson(url, { exchange, operation, timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw classifyHttpFailure({ exchange, operation, status: response.status });
    return await response.json();
  } catch (error) {
    if (error instanceof ApiDiagnosticError) throw error;
    throw new ApiDiagnosticError("network", "네트워크 또는 CORS 오류가 발생했습니다.", { exchange, operation });
  } finally {
    clearTimeout(timer);
  }
}
```

Implement `js/api/bybit.js` with exported `normalizeBybitKlines`, `fetchBybitTicker`,
`searchBybitSymbols`, `fetchBybitCandles`, and paginated `fetchBybitHistory`. Implement
`js/api/binance.js` with exported `fetchBinanceTicker` and `fetchBinanceCandles`. Each adapter
must call `toUsdtSymbol()`, validate response shape, and throw `ApiDiagnosticError` for missing
symbols or malformed responses.

- [ ] **Step 4: Run API tests**

Run: `node --test tests/api.test.js`

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit**

```bash
git add js/core/errors.js js/api/http.js js/api/bybit.js js/api/binance.js tests/api.test.js
git commit -m "feat: add public exchange adapters with diagnostics"
```

## Task 4: Implement Pure Indicators and Signal Classification

**Files:**
- Create: `js/analysis/indicators.js`
- Create: `js/analysis/signals.js`
- Create: `js/analysis/trade-plan.js`
- Create: `tests/signals.test.js`

- [ ] **Step 1: Write failing deterministic signal tests**

```js
// tests/signals.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCandles, classifyModes } from "../js/analysis/signals.js";
import { buildTradePlan } from "../js/analysis/trade-plan.js";

function candlesFrom(closes) {
  return closes.map((close, index) => ({
    time: index * 60_000, open: close - 0.2, high: close + 1, low: close - 1, close, volume: 100 + index,
  }));
}

test("returns a transparent neutral result when history is short", () => {
  assert.deepEqual(analyzeCandles(candlesFrom([1, 2, 3])), {
    direction: "neutral", score: 0, confidence: 0, reasons: ["분석에 필요한 캔들이 부족합니다."],
  });
});

test("creates conservative long entry zone, target, and stop", () => {
  const plan = buildTradePlan({ direction: "bull", close: 100, atr: 4 });
  assert.deepEqual(plan, { direction: "bull", entryLow: 98, entryHigh: 100, tp: 106, sl: 94, rr: 1.5 });
});

test("classifies common and mode-specific outputs independently", () => {
  const result = classifyModes({ direction: "bull", confidence: 74, volumeRatio: 1.3, trendStrength: 0.04 });
  assert.equal(result.common.eligible, true);
  assert.equal(result.day.eligible, true);
  assert.equal(typeof result.swing.eligible, "boolean");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/signals.test.js`

Expected: FAIL because analysis modules do not exist.

- [ ] **Step 3: Implement focused pure analysis functions**

Implement:

```js
// js/analysis/trade-plan.js
export function buildTradePlan({ direction, close, atr }) {
  if (!["bull", "bear"].includes(direction) || !Number.isFinite(close) || !Number.isFinite(atr)) return null;
  if (direction === "bull") {
    const entryLow = close - atr * 0.5;
    const entryHigh = close;
    const tp = close + atr * 1.5;
    const sl = close - atr * 1.5;
    return { direction, entryLow, entryHigh, tp, sl, rr: 1.5 };
  }
  const entryLow = close;
  const entryHigh = close + atr * 0.5;
  const tp = close - atr * 1.5;
  const sl = close + atr * 1.5;
  return { direction, entryLow, entryHigh, tp, sl, rr: 1.5 };
}
```

Implement `sma`, `ema`, `rsi`, `atr`, and `volumeRatio` in `indicators.js`. Implement
`analyzeCandles(candles)` and `classifyModes(analysis)` in `signals.js`. Use only candles passed
to each function. Return reasons as Korean strings so the manual card can explain why a mode
does or does not qualify.

- [ ] **Step 4: Run the analysis tests**

Run: `node --test tests/signals.test.js`

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit**

```bash
git add js/analysis tests/signals.test.js
git commit -m "feat: add pure signal and trade plan analysis"
```

## Task 5: Build the Conservative Historical Backtest Engine

**Files:**
- Create: `js/backtest/engine.js`
- Create: `tests/backtest-engine.test.js`

- [ ] **Step 1: Write failing conservative fill tests**

```js
// tests/backtest-engine.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { simulatePlannedTrade } from "../js/backtest/engine.js";

const plan = { direction: "bull", entryLow: 99, entryHigh: 100, tp: 106, sl: 94 };

test("records an untouched entry zone as unfilled", () => {
  const result = simulatePlannedTrade({ plan, futureCandles: [{ high: 110, low: 101, close: 105 }], waitCandles: 1, costPct: 0.31 });
  assert.equal(result.status, "unfilled");
});

test("uses SL first when TP and SL touch in one candle", () => {
  const futureCandles = [{ high: 100, low: 99, close: 99.5 }, { high: 107, low: 93, close: 100 }];
  const result = simulatePlannedTrade({ plan, futureCandles, waitCandles: 1, costPct: 0.31 });
  assert.equal(result.status, "closed");
  assert.equal(result.outcome, "loss");
  assert.equal(result.exitPrice, 94);
});

test("subtracts round-trip costs from PnL", () => {
  const futureCandles = [{ high: 100, low: 99, close: 99.5 }, { high: 107, low: 100, close: 106 }];
  const result = simulatePlannedTrade({ plan, futureCandles, waitCandles: 1, costPct: 0.31 });
  assert.equal(result.outcome, "win");
  assert.equal(Number(result.pnlPct.toFixed(2)), 5.69);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/backtest-engine.test.js`

Expected: FAIL because the engine does not exist.

- [ ] **Step 3: Implement the fill simulator and replay loop**

Implement `simulatePlannedTrade({ plan, futureCandles, waitCandles, costPct })` with these rules:

1. Search only the first `waitCandles` candles after signal confirmation for an entry-zone touch.
2. Return `{ status: "unfilled" }` when no touch occurs.
3. After entry, evaluate each candle with SL before TP.
4. Calculate direction-aware percentage PnL and subtract `costPct`.
5. Return `{ status: "open" }` when history ends before an exit.

Implement `runBacktest({ candles, mode, waitCandles, feePct, slippagePct })`. For every closed
historical candle, pass only `candles.slice(0, index + 1)` into `analyzeCandles()`. Build a plan
from that analysis, simulate future candles, and collect closed, open, and unfilled records.
Never pass future candles into signal analysis.

- [ ] **Step 4: Run the backtest engine tests**

Run: `node --test tests/backtest-engine.test.js`

Expected: PASS with 3 tests.

- [ ] **Step 5: Commit**

```bash
git add js/backtest/engine.js tests/backtest-engine.test.js
git commit -m "feat: add conservative historical backtest engine"
```

## Task 6: Add Backtest Metrics and CSV Export

**Files:**
- Create: `js/backtest/metrics.js`
- Create: `js/backtest/csv.js`
- Create: `tests/backtest-output.test.js`

- [ ] **Step 1: Write failing output tests**

```js
// tests/backtest-output.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { summarizeTrades } from "../js/backtest/metrics.js";
import { tradesToCsv } from "../js/backtest/csv.js";

const trades = [
  { symbol: "HBAR", mode: "day", status: "closed", outcome: "win", pnlPct: 4, rr: 1.5, holdCandles: 3 },
  { symbol: "HBAR", mode: "day", status: "closed", outcome: "loss", pnlPct: -2, rr: 1.5, holdCandles: 2 },
  { symbol: "BTC", mode: "common", status: "unfilled" },
];

test("summarizes wins, losses, drawdown, and unfilled trades", () => {
  const result = summarizeTrades(trades);
  assert.equal(result.closedTrades, 2);
  assert.equal(result.winRatePct, 50);
  assert.equal(result.unfilledTrades, 1);
  assert.equal(result.maxDrawdownPct, 2);
});

test("exports a CSV header and escaped rows", () => {
  const csv = tradesToCsv(trades);
  assert.match(csv, /^symbol,mode,status,outcome/);
  assert.match(csv, /HBAR,day,closed,win/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/backtest-output.test.js`

Expected: FAIL because metrics and CSV modules do not exist.

- [ ] **Step 3: Implement summaries and CSV serialization**

Implement `summarizeTrades(trades)` with closed trade count, win rate, compounded return,
maximum drawdown, average R/R, expectancy, profit factor, average holding candles, maximum
consecutive losses, and unfilled count. Add `groupSummaries(trades, key)` for `symbol` and
`mode`. Implement `tradesToCsv(trades)` with explicit columns and RFC-style double-quote
escaping.

- [ ] **Step 4: Run the output tests**

Run: `node --test tests/backtest-output.test.js`

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit**

```bash
git add js/backtest/metrics.js js/backtest/csv.js tests/backtest-output.test.js
git commit -m "feat: summarize and export backtest results"
```

## Task 7: Add Opt-In Storage and Observable State

**Files:**
- Create: `js/storage.js`
- Create: `js/state.js`
- Create: `tests/storage.test.js`

- [ ] **Step 1: Write failing persistence tests**

```js
// tests/storage.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { createStorage } from "../js/storage.js";

function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
}

test("does not persist when consent is off", () => {
  const backend = memoryStorage();
  const storage = createStorage(backend);
  storage.save({ persist: false, manualAssets: [{ symbol: "HBAR" }] });
  assert.equal(backend.getItem("signalcatch.settings.v1"), null);
});

test("persists only allowlisted settings after consent", () => {
  const backend = memoryStorage();
  const storage = createStorage(backend);
  storage.save({ persist: true, manualAssets: [{ symbol: "HBAR", exchange: "bybit" }], ui: { activeTab: "manual" }, secret: "blocked" });
  assert.equal(JSON.parse(backend.getItem("signalcatch.settings.v1")).secret, undefined);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/storage.test.js`

Expected: FAIL because storage module does not exist.

- [ ] **Step 3: Implement allowlisted storage and state**

Implement `createStorage(backend)` with `load()`, `save(settings)`, and `clear()`. Persist only
`persist`, `manualAssets`, `ui`, and `backtestDefaults`. When `persist` is false, remove the
existing record. Implement `createState(initialState)` with `getState()`, `setState(patch)`, and
`subscribe(listener)`.

- [ ] **Step 4: Run the storage tests**

Run: `node --test tests/storage.test.js`

Expected: PASS with 2 tests.

- [ ] **Step 5: Commit**

```bash
git add js/storage.js js/state.js tests/storage.test.js
git commit -m "feat: add opt-in dashboard persistence"
```

## Task 8: Implement Market Regime and Bybit Scanner Services

**Files:**
- Create: `js/analysis/market-regime.js`
- Create: `js/services/manual-assets.js`
- Create: `js/services/scanner.js`
- Create: `tests/services.test.js`

- [ ] **Step 1: Write failing service tests with injected adapters**

```js
// tests/services.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { createManualAssetService } from "../js/services/manual-assets.js";

test("keeps HBAR visible even when no mode qualifies", async () => {
  const service = createManualAssetService({
    bybit: { fetchTicker: async () => ({ symbol: "HBARUSDT", markPrice: 0.2 }), fetchCandles: async () => [] },
  });
  const asset = await service.add({ symbol: "hbar", exchange: "bybit" });
  assert.equal(asset.symbol, "HBAR");
  assert.equal(asset.visible, true);
  assert.equal(asset.modeResults.every((result) => result.eligible === false), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/services.test.js`

Expected: FAIL because services do not exist.

- [ ] **Step 3: Implement services**

Implement `createManualAssetService(adapters)` with `add({ symbol, exchange })`, `refresh(id)`,
and `remove(id)`. Cards remain in the returned list even when analysis fails or every mode is
ineligible. Implement scanner service with injected Bybit adapter, bounded concurrency, and
Bybit-only universe scanning. Implement `analyzeMarketRegime({ btcCandles, ethCandles })` as a
pure aggregator.

- [ ] **Step 4: Run the service tests**

Run: `node --test tests/services.test.js`

Expected: PASS including the HBAR visibility regression.

- [ ] **Step 5: Commit**

```bash
git add js/analysis/market-regime.js js/services tests/services.test.js
git commit -m "feat: add visible manual assets and Bybit scanner services"
```

## Task 9: Build the Dashboard UI

**Files:**
- Create: `js/ui/dom.js`
- Create: `js/ui/dashboard.js`
- Create: `js/ui/manual-assets.js`
- Create: `js/ui/scanner.js`
- Create: `js/ui/backtest-view.js`
- Create: `js/ui/auxiliary.js`
- Modify: `index.html`
- Modify: `css/styles.css`
- Create: `js/app.js`
- Create: `tests/dom.test.js`

- [ ] **Step 1: Write failing safe DOM tests**

```js
// tests/dom.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { setText } from "../js/ui/dom.js";

test("writes remote values through textContent", () => {
  const node = { textContent: "" };
  setText(node, "<img src=x onerror=alert(1)>");
  assert.equal(node.textContent, "<img src=x onerror=alert(1)>");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/dom.test.js`

Expected: FAIL because UI helpers do not exist.

- [ ] **Step 3: Implement the dashboard shell and safe rendering**

```js
// js/ui/dom.js
export function setText(node, value) {
  node.textContent = value == null ? "" : String(value);
  return node;
}

export function el(tag, { className = "", text = "", attrs = {} } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  setText(node, text);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}
```

Replace the minimal shell with:

- header with app name, Bybit-first label, API status, refreshed time, and settings button
- four summary cards
- tabs for `직접 추가`, `자동 후보`, `백테스트`, and `부가 분석`
- manual asset form with exchange selector and a card grid
- scanner controls and result table
- backtest form with preset period buttons, dates, costs, editable wait candles, selected symbols,
  run button, metric grid, equity SVG, grouped comparison tables, trade table, and CSV button
- collapsible auxiliary sections
- settings dialog with opt-in persistence toggle

Render all remote values with `setText()` or DOM properties. Do not interpolate API-originated
strings into `innerHTML`.

Use CSS Grid for a wide financial-dashboard layout. At widths below `760px`, switch summary
cards, forms, and content panels to one column. Preserve every control on mobile.

- [ ] **Step 4: Run automated tests**

Run: `npm test`

Expected: PASS for all tests.

- [ ] **Step 5: Perform browser layout inspection**

Run: `npx serve .`

Expected: local static site is available. Use the in-app browser to verify desktop and mobile
layouts, HBAR manual card visibility, diagnostics expansion, tab navigation, preset dates,
editable costs, and CSV button rendering.

- [ ] **Step 6: Commit**

```bash
git add index.html css/styles.css js/app.js js/ui tests/dom.test.js
git commit -m "feat: build responsive crypto dashboard interface"
```

## Task 10: Wire Live Public APIs and Backtest Workflows

**Files:**
- Modify: `js/app.js`
- Modify: `js/ui/manual-assets.js`
- Modify: `js/ui/scanner.js`
- Modify: `js/ui/backtest-view.js`
- Create: `tests/workflow.test.js`

- [ ] **Step 1: Write failing workflow tests with fake adapters**

```js
// tests/workflow.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { buildBacktestRequest } from "../js/ui/backtest-view.js";

test("builds requests for selected manual symbols and every comparison mode", () => {
  const request = buildBacktestRequest({
    symbols: ["HBAR", "BTC"], selected: ["HBAR"], startDate: "2026-01-01", endDate: "2026-03-01",
    feePct: 0.11, slippagePct: 0.2, waitCandles: { common: 8, scalp: 6, day: 12, daily: 6, swing: 4 },
  });
  assert.deepEqual(request.symbols, ["HBAR"]);
  assert.deepEqual(request.modes, ["common", "scalp", "day", "daily", "swing"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/workflow.test.js`

Expected: FAIL because request builder is not exported.

- [ ] **Step 3: Wire end-to-end browser workflows**

Implement:

- Bybit symbol suggestions and manual add
- Binance direct manual add without Binance auto-scan or Binance backtest controls
- API status and refreshed-time updates
- manual-card diagnostics expansion
- Bybit scanner run with progress and candidate results
- selected-manual-symbol Bybit history fetching
- common plus four mode backtests
- metrics, grouped summaries, equity chart, trades table, and CSV download
- settings persistence consent

Export and test `buildBacktestRequest(formState)`. Keep remote operations behind adapters so
tests use fakes and live verification uses actual public endpoints.

- [ ] **Step 4: Run all automated tests**

Run: `npm test`

Expected: PASS for all tests.

- [ ] **Step 5: Commit**

```bash
git add js tests/workflow.test.js
git commit -m "feat: connect live analysis and backtest workflows"
```

## Task 11: Add Documentation and Security Review

**Files:**
- Create: `README.md`
- Create: `docs/security-review.md`

- [ ] **Step 1: Write deployment and security documentation**

Document:

- GitHub Pages deployment from `main`
- no API keys, login, server, or database
- Bybit-first feature matrix and Binance manual-analysis-only boundary
- local usage with a static server
- rate-limit and CORS behavior
- persistence consent and allowlisted storage fields
- HBAR manual-add regression verification
- backtest assumptions: closed-candle signals, delayed zone fill, SL-first same-candle ordering,
  default `0.11%` fee and `0.20%` slippage
- financial disclaimer

- [ ] **Step 2: Run security-oriented searches**

Run:

```bash
rg -n "api[_-]?key|secret|token|authorization|innerHTML|insertAdjacentHTML|eval\\(|new Function|document\\.write|localStorage" .
```

Expected:

- no API credentials or authorization headers
- no dynamic code execution
- any `innerHTML` use is limited to static trusted templates, or removed
- localStorage access exists only in `js/storage.js`

- [ ] **Step 3: Run all automated tests**

Run: `npm test`

Expected: PASS for all tests.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/security-review.md
git commit -m "docs: document deployment and security review"
```

## Task 12: Verify in Browser and Publish to GitHub Pages

**Files:**
- Modify only if verification uncovers defects.

- [ ] **Step 1: Run complete automated verification**

Run:

```bash
npm test
git diff --check
git status --short
```

Expected: all tests pass, no whitespace errors, clean working tree.

- [ ] **Step 2: Start a local static server**

Run: `npx serve .`

Expected: the dashboard is reachable locally.

- [ ] **Step 3: Verify required browser scenarios**

Use the in-app browser and verify:

1. Search `HBAR`, add it from Bybit, and confirm the card remains in `직접 추가`.
2. Select each mode and confirm the HBAR card never disappears.
3. Expand HBAR diagnostics and confirm status, exchange, operation, and timestamp are visible.
4. Run Bybit candidate scan and confirm results remain separate from manual assets.
5. Add a Binance manual asset and confirm Binance is absent from scanner and backtest exchange controls.
6. Run a short HBAR backtest and confirm common plus four mode summaries, costs, unfilled trades,
   and CSV download.
7. Toggle storage off, reload, and confirm settings are not restored.
8. Toggle storage on, reload, and confirm allowlisted settings are restored.
9. Inspect desktop and narrow mobile widths.

- [ ] **Step 4: Ask for GitHub target confirmation**

Ask the user to confirm whether to update the existing public repository
`dg920205-prog/signalcatch` and its GitHub Pages deployment. Do not overwrite remote history
before confirmation.

- [ ] **Step 5: Push verified commits**

Run:

```bash
git branch -M main
git remote add origin https://github.com/dg920205-prog/signalcatch.git
git push -u origin main
```

Expected: push succeeds without force. If the remote already contains unrelated history, fetch
and inspect it before choosing a non-destructive integration method.

- [ ] **Step 6: Confirm GitHub Pages**

Use GitHub CLI or the repository settings to ensure Pages deploys from `main`. Open the public
Pages URL and repeat the HBAR add scenario.

- [ ] **Step 7: Report final evidence**

Report:

- test count and passing commands
- live HBAR regression result
- desktop and mobile browser verification
- security review findings
- repository URL
- GitHub Pages URL

