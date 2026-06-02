import { tradesToCsv } from "../backtest/csv.js";
import { buildEquitySeries } from "../backtest/metrics.js";
import { BACKTEST_DEFAULTS, MODE_CONFIG } from "../config.js";
import { normalizeBaseSymbol } from "../core/symbols.js";
import { safeText, snapshotArray } from "./dom.js";

const MODES = ["common", "scalp", "day", "daily", "swing"];
const DEFAULT_WAITS = Object.fromEntries(
  MODES.map((mode) => [mode, MODE_CONFIG[mode].waitCandles]),
);
const DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;
const INVALID_SETTINGS = "잘못된 백테스트 설정입니다.";

function safeRead(value, key, fallback) {
  try {
    return value?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

function readSetting(value, key, fallback) {
  try {
    if (value === null || value === undefined) {
      return fallback;
    }
    const descriptor = Object.getOwnPropertyDescriptor(Object(value), key);
    if (!descriptor) {
      return fallback;
    }
    if (!Object.hasOwn(descriptor, "value")) {
      throw new Error(INVALID_SETTINGS);
    }
    return descriptor.value ?? fallback;
  } catch {
    throw new Error(INVALID_SETTINGS);
  }
}

function parseDecimal(value, label) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : NaN;
  }
  if (typeof value !== "string" || !DECIMAL.test(value.trim())) {
    throw new TypeError(`Invalid ${label}.`);
  }
  return Number(value);
}

function validCost(value, label) {
  const number = parseDecimal(value, label);
  if (!Number.isFinite(number) || number < 0 || number > 10) {
    throw new TypeError(`Invalid ${label}.`);
  }
  return number;
}

function validWait(value) {
  const number = parseDecimal(value, "wait candles");
  if (!Number.isSafeInteger(number) || number < 1 || number > 500) {
    throw new TypeError("Invalid wait candles.");
  }
  return number;
}

function validDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day)
  );
}

function normalizeSymbols(values) {
  const snapshot = snapshotArray(values, 100, { strict: true });
  if (!snapshot.ok || snapshot.truncated) throw new Error(INVALID_SETTINGS);
  const symbols = [];
  const seen = new Set();
  for (const value of snapshot.values) {
    try {
      const symbol = normalizeBaseSymbol(value);
      if (!seen.has(symbol)) {
        seen.add(symbol);
        symbols.push(symbol);
      }
    } catch {
      // Exclude invalid symbols from requests.
    }
  }
  return symbols;
}

export function buildBacktestRequest(formState = {}) {
  try {
    const available = new Set(
      normalizeSymbols(readSetting(formState, "symbols", [])),
    );
    const symbols = normalizeSymbols(readSetting(formState, "selected", [])).filter(
      (symbol) => available.has(symbol),
    );
    const modesSnapshot = snapshotArray(
      readSetting(formState, "modes", MODES),
      MODES.length,
      { strict: true },
    );
    const modes = modesSnapshot.values;
    const startDate = readSetting(formState, "startDate");
    const endDate = readSetting(formState, "endDate");
    const waitSettings = readSetting(formState, "waitCandles");
    const waits = {};

    if (symbols.length === 0) throw new Error(INVALID_SETTINGS);
    if (!modesSnapshot.ok || modesSnapshot.truncated || modes.length === 0)
      throw new Error(INVALID_SETTINGS);
    for (const mode of modes) {
      if (!MODES.includes(mode)) throw new Error(INVALID_SETTINGS);
    }
    if (!validDate(startDate) || !validDate(endDate) || startDate > endDate)
      throw new Error(INVALID_SETTINGS);
    if (
      waitSettings !== undefined &&
      (waitSettings === null || typeof waitSettings !== "object")
    ) {
      throw new Error(INVALID_SETTINGS);
    }
    for (const mode of MODES) {
      waits[mode] = validWait(readSetting(waitSettings, mode, DEFAULT_WAITS[mode]));
    }
    const roundTripFeePct = validCost(
      readSetting(formState, "roundTripFeePct", BACKTEST_DEFAULTS.roundTripFeePct),
      "fee",
    );
    const roundTripSlippagePct = validCost(
      readSetting(
        formState,
        "roundTripSlippagePct",
        BACKTEST_DEFAULTS.roundTripSlippagePct,
      ),
      "slippage",
    );
    if (roundTripFeePct + roundTripSlippagePct > 10)
      throw new Error(INVALID_SETTINGS);

    return {
      symbols,
      modes,
      startDate,
      endDate,
      roundTripFeePct,
      roundTripSlippagePct,
      waitCandles: waits,
    };
  } catch {
    throw new Error(INVALID_SETTINGS);
  }
}

export function renderExecutionCard(container, run = {}, { dom }) {
  dom.clear(container);
  const oosMetrics = safeRead(run, "oosMetrics", {});
  const entries = [
    ["기간", `${safeText(run.startDate, "-")} ~ ${safeText(run.endDate, "-")}`],
    ["심볼", safeText(run.symbolsText, "-")],
    ["모드", safeText(run.modesText, "-")],
    ["데이터 소스", safeText(run.dataSource, "Bybit 기준 임시 산정")],
    ["OOS", safeText(run.oosLabel, "미적용")],
    ["OOS 승률 ", `${safeText(safeRead(oosMetrics, "winRatePct"), 0)}%`],
    ["OOS 수익률 ", `${safeText(safeRead(oosMetrics, "compoundedReturnPct"), 0)}%`],
  ];
  dom.append(
    container,
    entries.map(([label, value]) =>
      dom.el(
        "div",
        { class: "metric-card" },
        dom.el("span", { class: "muted" }, label),
        dom.el("strong", {}, value),
      ),
    ),
  );
}

export function renderBacktestMetrics(container, metrics = {}, { dom }) {
  dom.clear(container);
  const entries = [
    ["Closed trades", safeText(safeRead(metrics, "closedTrades"), 0)],
    ["Win rate", `${safeText(safeRead(metrics, "winRatePct"), 0)}%`],
    ["Return", `${safeText(safeRead(metrics, "compoundedReturnPct"), 0)}%`],
    ["Max drawdown", `${safeText(safeRead(metrics, "maxDrawdownPct"), 0)}%`],
    ["Expectancy", `${safeText(safeRead(metrics, "expectancyPct"), 0)}%`],
    ["Profit factor", safeText(safeRead(metrics, "profitFactor"), 0)],
  ];
  dom.append(
    container,
    entries.map(([label, value]) =>
      dom.el(
        "article",
        { class: "metric-card" },
        dom.el("span", { class: "muted" }, label),
        dom.el("strong", {}, value),
      ),
    ),
  );
}

export function renderEquityCurve(container, trades = [], { dom }) {
  dom.clear(container);
  const series = buildEquitySeries(snapshotArray(trades).values);
  if (series.length <= 1) {
    dom.append(
      container,
      dom.el("p", { class: "empty-state" }, "Run a backtest to calculate the equity curve."),
    );
    return;
  }

  const width = 800;
  const height = 180;
  const padding = 12;
  const minimum = Math.min(...series);
  const maximum = Math.max(...series);
  const range = maximum - minimum;
  const points = series
    .map((equity, index) => {
      const x = padding + (index / (series.length - 1)) * (width - padding * 2);
      const y = range === 0
        ? height / 2
        : height - padding - ((equity - minimum) / range) * (height - padding * 2);
      return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`;
    })
    .join(" ");

  dom.append(
    container,
    dom.el(
      "svg",
      { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-label": "Computed equity curve" },
      dom.el("polyline", { points }),
    ),
  );
}

function renderGrouped(container, grouped = {}, { dom }) {
  dom.clear(container);
  const body = dom.el("tbody");
  for (const [key, summary] of Object.entries(grouped)) {
    dom.append(
      body,
      dom.el(
        "tr",
        {},
        dom.el("td", {}, safeText(key, "-")),
        dom.el("td", {}, `${safeText(summary.closedTrades, 0)}`),
        dom.el("td", {}, `${safeText(summary.winRatePct, 0)}%`),
        dom.el("td", {}, `${safeText(summary.compoundedReturnPct, 0)}%`),
      ),
    );
  }
  dom.append(
    container,
    dom.el(
      "table",
      { class: "data-table" },
      dom.el(
        "thead",
        {},
        dom.el(
          "tr",
          {},
          ...["Key", "Closed", "Win Rate", "Return"]
            .map((label) => dom.el("th", {}, label)),
        ),
      ),
      body,
    ),
  );
}

export function renderGroupedBySymbol(container, grouped = {}, options) {
  renderGrouped(container, grouped, options);
}

export function renderGroupedByMode(container, grouped = {}, options) {
  renderGrouped(container, grouped, options);
}

export function renderTrades(container, trades = [], { dom }) {
  dom.clear(container);
  const body = dom.el("tbody");
  for (const trade of snapshotArray(trades).values) {
    dom.append(
      body,
      dom.el(
        "tr",
        {},
        ...["symbol", "mode", "status", "outcome", "pnlPct", "holdCandles"].map(
          (key) => dom.el("td", {}, safeText(safeRead(trade, key), "-")),
        ),
      ),
    );
  }
  dom.append(
    container,
    dom.el(
      "table",
      { class: "data-table" },
      dom.el(
        "thead",
        {},
        dom.el(
          "tr",
          {},
          ...["Symbol", "Mode", "Status", "Outcome", "PnL %", "Hold"].map((label) =>
            dom.el("th", {}, label),
          ),
        ),
      ),
      body,
    ),
  );
}

export const renderBacktestResults = renderTrades;

export function exportBacktestCsv(trades = []) {
  return tradesToCsv(trades);
}

export function downloadBacktestCsv(
  trades = [],
  {
    BlobCtor = globalThis.Blob,
    createAnchor = () => document.createElement("a"),
    createObjectURL = (blob) => URL.createObjectURL(blob),
    revokeObjectURL = (url) => URL.revokeObjectURL(url),
    now = Date.now,
  } = {},
) {
  const blob = new BlobCtor([exportBacktestCsv(trades)], {
    type: "text/csv;charset=utf-8",
  });
  const url = createObjectURL(blob);
  const anchor = createAnchor();
  const filename = `signalcatch-backtest-${now()}.csv`;
  anchor.href = url;
  anchor.download = filename;
  try {
    anchor.click();
  } finally {
    revokeObjectURL(url);
  }
  return filename;
}
