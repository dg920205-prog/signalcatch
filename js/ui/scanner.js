import { safeText, snapshotArray } from "./dom.js";

const MODES = ["common", "scalp", "day", "daily", "swing"];

function safeRead(value, key, fallback) {
  try {
    return value?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

export function renderScannerResults(container, candidates = [], { dom, onBacktest } = {}) {
  dom.clear(container);
  const body = dom.el("tbody");
  const hasBacktestAction = typeof onBacktest === "function";
  for (const candidate of snapshotArray(candidates).values) {
    const modeResults = safeRead(candidate, "modeResults", {});
    const symbol = safeText(safeRead(candidate, "symbol"), "Unknown");
    dom.append(body, dom.el("tr", {},
      dom.el("td", {}, symbol),
      dom.el("td", {}, safeText(safeRead(candidate, "exchange"), "Bybit")),
      dom.el("td", {}, safeText(safeRead(candidate, "status"), "idle")),
      ...MODES.map((mode) => dom.el("td", {}, safeRead(safeRead(modeResults, mode, {}), "eligible", false) ? "Signal" : "-")),
      hasBacktestAction
        ? dom.el("td", {}, dom.el("button", {
            type: "button",
            onClick: () => onBacktest(symbol),
          }, "Backtest"))
        : null,
    ));
  }
  dom.append(container, dom.el("table", { class: "data-table" },
    dom.el("thead", {}, dom.el("tr", {},
      dom.el("th", {}, "Symbol"), dom.el("th", {}, "Exchange"), dom.el("th", {}, "Status"),
      ...MODES.map((mode) => dom.el("th", {}, mode)),
      hasBacktestAction ? dom.el("th", {}, "Action") : null,
    )),
    body,
  ));
}

export function renderScannerProgress(node, { completed = 0, total = 0 } = {}, { dom }) {
  const safeCompleted = safeText(completed, 0);
  const safeTotal = safeText(total, 0);
  node.setAttribute("max", String(safeTotal || 1));
  node.setAttribute("value", String(safeCompleted));
  dom.setText(node.nextElementSibling, `${safeCompleted} / ${safeTotal}`);
}
