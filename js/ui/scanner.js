import { safeText, snapshotArray } from "./dom.js";

const MODES = ["common", "scalp", "day", "daily", "swing"];

function safeRead(value, key, fallback) {
  try {
    return value?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

export function renderScannerResults(container, candidates = [], { dom }) {
  dom.clear(container);
  const body = dom.el("tbody");
  for (const candidate of snapshotArray(candidates).values) {
    const modeResults = safeRead(candidate, "modeResults", {});
    dom.append(body, dom.el("tr", {},
      dom.el("td", {}, safeText(safeRead(candidate, "symbol"), "Unknown")),
      dom.el("td", {}, safeText(safeRead(candidate, "exchange"), "Bybit")),
      dom.el("td", {}, safeText(safeRead(candidate, "status"), "idle")),
      ...MODES.map((mode) => dom.el("td", {}, safeRead(safeRead(modeResults, mode, {}), "eligible", false) ? "Signal" : "-")),
    ));
  }
  dom.append(container, dom.el("table", { class: "data-table" },
    dom.el("thead", {}, dom.el("tr", {},
      dom.el("th", {}, "Symbol"), dom.el("th", {}, "Exchange"), dom.el("th", {}, "Status"),
      ...MODES.map((mode) => dom.el("th", {}, mode)),
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
