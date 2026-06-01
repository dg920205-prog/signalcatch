import { tradesToCsv } from "../backtest/csv.js";
import { BACKTEST_DEFAULTS, MODE_CONFIG } from "../config.js";
import { normalizeBaseSymbol } from "../core/symbols.js";
import { safeText } from "./dom.js";

const MODES = ["common", "scalp", "day", "daily", "swing"];
const DEFAULT_WAITS = Object.fromEntries(MODES.map((mode) => [mode, MODE_CONFIG[mode].waitCandles]));
const DECIMAL = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

function safeRead(value, key, fallback) {
  try {
    return value?.[key] ?? fallback;
  } catch {
    return fallback;
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
  return date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day);
}

function normalizeSymbols(values) {
  if (!Array.isArray(values)) return [];
  const symbols = [];
  for (const value of values) {
    try {
      symbols.push(normalizeBaseSymbol(value));
    } catch {
      // Invalid UI selections are excluded from the request boundary.
    }
  }
  return [...new Set(symbols)];
}

export function buildBacktestRequest(formState = {}) {
  const available = new Set(normalizeSymbols(safeRead(formState, "symbols", [])));
  const symbols = normalizeSymbols(safeRead(formState, "selected", []))
    .filter((symbol) => available.has(symbol));
  const modes = formState.modes ?? MODES;
  const startDate = formState.startDate;
  const endDate = formState.endDate;
  const waits = { ...DEFAULT_WAITS, ...(formState.waitCandles ?? {}) };

  if (symbols.length === 0) throw new TypeError("At least one symbol is required.");
  if (!Array.isArray(modes) || modes.length === 0 || modes.some((mode) => !MODES.includes(mode))) throw new TypeError("Invalid mode.");
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) throw new TypeError("Invalid date range.");
  for (const mode of MODES) {
    waits[mode] = validWait(safeRead(waits, mode));
  }
  const roundTripFeePct = validCost(formState.roundTripFeePct ?? BACKTEST_DEFAULTS.roundTripFeePct, "fee");
  const roundTripSlippagePct = validCost(formState.roundTripSlippagePct ?? BACKTEST_DEFAULTS.roundTripSlippagePct, "slippage");
  if (roundTripFeePct + roundTripSlippagePct > 10) throw new TypeError("Invalid combined cost.");

  return {
    symbols,
    modes: [...modes],
    startDate,
    endDate,
    roundTripFeePct,
    roundTripSlippagePct,
    waitCandles: waits,
  };
}

export function renderBacktestMetrics(container, metrics = {}, { dom }) {
  dom.clear(container);
  const entries = [
    ["Closed trades", safeText(safeRead(metrics, "closedTrades"), 0)], ["Win rate", `${safeText(safeRead(metrics, "winRatePct"), 0)}%`],
    ["Return", `${safeText(safeRead(metrics, "compoundedReturnPct"), 0)}%`], ["Max drawdown", `${safeText(safeRead(metrics, "maxDrawdownPct"), 0)}%`],
    ["Expectancy", `${safeText(safeRead(metrics, "expectancyPct"), 0)}%`], ["Profit factor", safeText(safeRead(metrics, "profitFactor"), 0)],
  ];
  dom.append(container, entries.map(([label, value]) => dom.el("article", { class: "metric-card" }, dom.el("span", { class: "muted" }, label), dom.el("strong", {}, value))));
}

export function renderTrades(container, trades = [], { dom }) {
  dom.clear(container);
  const body = dom.el("tbody");
  for (const trade of trades) {
    dom.append(body, dom.el("tr", {}, ...["symbol", "mode", "status", "outcome", "pnlPct", "holdCandles"].map((key) => dom.el("td", {}, safeText(safeRead(trade, key), "-")))));
  }
  dom.append(container, dom.el("table", { class: "data-table" },
    dom.el("thead", {}, dom.el("tr", {}, ...["Symbol", "Mode", "Status", "Outcome", "PnL %", "Hold"].map((label) => dom.el("th", {}, label)))),
    body,
  ));
}

export function exportBacktestCsv(trades = []) {
  return tradesToCsv(trades);
}
