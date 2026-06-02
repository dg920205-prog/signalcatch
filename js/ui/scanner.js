import { safeText, snapshotArray } from "./dom.js";
import { formatPrice } from "./format.js";

const MODES = ["common", "scalp", "day", "daily", "swing"];

function safeRead(value, key, fallback) {
  try {
    return value?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

function renderSplit(split, plan, dom) {
  const entries = snapshotArray(safeRead(split, "entries", []), 3).values;
  const targets = snapshotArray(safeRead(split, "targets", []), 3).values;
  if (!entries.length || !targets.length) return null;
  return dom.el(
    "div",
    { class: "split-note" },
    dom.el(
      "div",
      { class: "split-section split-entry" },
      `분할 진입 ${entries.map((entry) =>
        `${safeText(safeRead(entry, "label"), "-")} ${formatPrice(safeRead(entry, "price"))} (${safeText(safeRead(entry, "weightPct"), "-")}%)`,
      ).join(", ")}`,
    ),
    dom.el(
      "div",
      { class: "split-section split-sl" },
      `SL ${formatPrice(safeRead(plan, "sl"))}`,
    ),
    dom.el(
      "div",
      { class: "split-section split-tp" },
      `분할 TP ${targets.map((target) =>
        `${safeText(safeRead(target, "label"), "-")} ${formatPrice(safeRead(target, "price"))} (${safeText(safeRead(target, "weightPct"), "-")}%)`,
      ).join(", ")}`,
    ),
  );
}

function renderSetupDetails(candidate, dom) {
  const setups = safeRead(candidate, "setups", {});
  const body = dom.el("tbody");
  for (const mode of MODES) {
    const setup = safeRead(setups, mode, {});
    const plan = safeRead(setup, "plan", null);
    const recommendation = safeRead(setup, "recommendation", {});
    dom.append(
      body,
      dom.el(
        "tr",
        {},
        dom.el("td", {}, mode),
        dom.el("td", {}, safeText(safeRead(setup, "direction"), "neutral")),
        dom.el("td", {}, plan ? `${formatPrice(safeRead(plan, "entryLow"))} ~ ${formatPrice(safeRead(plan, "entryHigh"))}` : "-"),
        dom.el("td", {}, plan ? formatPrice(safeRead(plan, "sl")) : "-"),
        dom.el("td", {}, plan ? formatPrice(safeRead(plan, "tp")) : "-"),
        dom.el("td", {}, safeText(safeRead(recommendation, "label"), "비추천")),
        dom.el("td", {}, renderSplit(safeRead(recommendation, "split", null), plan, dom)),
      ),
    );
  }
  return dom.el(
    "details",
    { class: "scanner-setups" },
    dom.el("summary", {}, "현재 셋업 보기"),
    dom.el("p", { class: "muted" }, `현재가 ${formatPrice(safeRead(candidate, "price"))}`),
    dom.el(
      "table",
      { class: "data-table setup-table" },
      dom.el(
        "thead",
        {},
        dom.el(
          "tr",
          {},
          ...["모드", "방향", "진입 구간", "SL", "TP", "추천", "분할 안내"].map((label) =>
            dom.el("th", {}, label),
          ),
        ),
      ),
      body,
    ),
  );
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
    ), dom.el("tr", { class: "scanner-detail-row" },
      dom.el("td", { class: "scanner-detail-cell", colspan: hasBacktestAction ? 9 : 8 },
        renderSetupDetails(candidate, dom),
      ),
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
