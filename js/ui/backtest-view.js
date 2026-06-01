import { tradesToCsv } from "../backtest/csv.js";
import { BACKTEST_DEFAULTS } from "../config.js";
import { normalizeBaseSymbol } from "../core/symbols.js";

const MODES = ["common", "scalp", "day", "daily", "swing"];
const DEFAULT_WAITS = Object.fromEntries(MODES.map((mode) => [mode, 8]));

function validCost(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 10) {
    throw new TypeError(`Invalid ${label}.`);
  }
  return number;
}

export function buildBacktestRequest(formState = {}) {
  const symbols = [...new Set((formState.symbols ?? []).map(normalizeBaseSymbol))];
  const modes = formState.modes ?? MODES;
  const startDate = formState.startDate;
  const endDate = formState.endDate;
  const waits = { ...DEFAULT_WAITS, ...(formState.waitCandles ?? {}) };

  if (symbols.length === 0) throw new TypeError("At least one symbol is required.");
  if (!Array.isArray(modes) || modes.length === 0 || modes.some((mode) => !MODES.includes(mode))) throw new TypeError("Invalid mode.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(endDate ?? "") || startDate > endDate) throw new TypeError("Invalid date range.");
  for (const mode of MODES) {
    if (!Number.isSafeInteger(Number(waits[mode])) || Number(waits[mode]) < 1 || Number(waits[mode]) > 500) throw new TypeError("Invalid wait candles.");
    waits[mode] = Number(waits[mode]);
  }

  return {
    symbols,
    modes: [...modes],
    startDate,
    endDate,
    roundTripFeePct: validCost(formState.roundTripFeePct ?? BACKTEST_DEFAULTS.roundTripFeePct, "fee"),
    roundTripSlippagePct: validCost(formState.roundTripSlippagePct ?? BACKTEST_DEFAULTS.roundTripSlippagePct, "slippage"),
    waitCandles: waits,
  };
}

export function renderBacktestMetrics(container, metrics = {}, { dom }) {
  dom.clear(container);
  const entries = [
    ["Closed trades", metrics.closedTrades ?? 0], ["Win rate", `${metrics.winRatePct ?? 0}%`],
    ["Return", `${metrics.compoundedReturnPct ?? 0}%`], ["Max drawdown", `${metrics.maxDrawdownPct ?? 0}%`],
    ["Expectancy", `${metrics.expectancyPct ?? 0}%`], ["Profit factor", metrics.profitFactor ?? 0],
  ];
  dom.append(container, entries.map(([label, value]) => dom.el("article", { class: "metric-card" }, dom.el("span", { class: "muted" }, label), dom.el("strong", {}, value))));
}

export function renderTrades(container, trades = [], { dom }) {
  dom.clear(container);
  const body = dom.el("tbody");
  for (const trade of trades) {
    dom.append(body, dom.el("tr", {}, ...["symbol", "mode", "status", "outcome", "pnlPct", "holdCandles"].map((key) => dom.el("td", {}, trade?.[key] ?? "-"))));
  }
  dom.append(container, dom.el("table", { class: "data-table" },
    dom.el("thead", {}, dom.el("tr", {}, ...["Symbol", "Mode", "Status", "Outcome", "PnL %", "Hold"].map((label) => dom.el("th", {}, label)))),
    body,
  ));
}

export function exportBacktestCsv(trades = []) {
  return tradesToCsv(trades);
}
