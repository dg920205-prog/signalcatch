import { safeText, snapshotArray } from "./dom.js";
import { formatPrice } from "./format.js";
import { selectStrongestSetup } from "../analysis/market-heatmap.js";
import { recommendationBadge } from "./recommendation-badge.js";

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
  const cards = MODES.map((mode) => {
    const setup = safeRead(setups, mode, {});
    const plan = safeRead(setup, "plan", null);
    const recommendation = safeRead(setup, "recommendation", {});
    return dom.el("article", { class: `setup-detail-card mode-${mode}` },
      dom.el("div", { class: "setup-card-head" },
        dom.el("strong", {}, mode),
        dom.el("span", { class: "recommendation-badge" }, recommendationBadge(safeRead(recommendation, "label"))),
      ),
      dom.el("div", { class: "setup-card-meta" },
        dom.el("span", {}, `방향 ${safeText(safeRead(setup, "direction"), "neutral")}`),
      ),
      dom.el("div", { class: "setup-stat-grid" },
        dom.el("div", { class: "setup-stat setup-entry" },
          dom.el("span", {}, "진입"),
          dom.el("strong", {}, plan ? `${formatPrice(safeRead(plan, "entryLow"))} ~ ${formatPrice(safeRead(plan, "entryHigh"))}` : "-"),
        ),
        dom.el("div", { class: "setup-stat setup-sl" },
          dom.el("span", {}, "SL"),
          dom.el("strong", {}, plan ? formatPrice(safeRead(plan, "sl")) : "-"),
        ),
        dom.el("div", { class: "setup-stat setup-tp" },
          dom.el("span", {}, "TP"),
          dom.el("strong", {}, plan ? formatPrice(safeRead(plan, "tp")) : "-"),
        ),
      ),
      renderSplit(safeRead(recommendation, "split", null), plan, dom),
    );
  });
  return dom.el(
    "details",
    { class: "scanner-setups" },
    dom.el("summary", {}, "현재 셋업 보기"),
    dom.el("p", { class: "muted" }, `현재가 ${formatPrice(safeRead(candidate, "price"))}`),
    dom.el("div", { class: "setup-card-list" }, cards),
  );
}

export function renderScannerResults(container, candidates = [], { dom } = {}) {
  dom.clear(container);
  const rows = snapshotArray(candidates).values.map((candidate) => {
    const symbol = safeText(safeRead(candidate, "symbol"), "Unknown");
    const bestSetup = selectStrongestSetup(safeRead(candidate, "setups", {}));
    return dom.el("article", { class: "scanner-result-card" },
      dom.el("div", { class: "scanner-result-head" },
        dom.el("strong", {}, symbol),
        dom.el("span", { class: "recommendation-badge" },
          recommendationBadge(safeRead(safeRead(bestSetup, "recommendation", {}), "label"))),
      ),
      dom.el("div", { class: "scanner-result-summary" },
        dom.el("span", {}, `현재가 ${formatPrice(safeRead(candidate, "price"))}`),
        dom.el("span", {}, `셋업 ${safeText(safeRead(bestSetup, "mode"), "-")}`),
        dom.el("span", {}, `방향 ${safeText(safeRead(bestSetup, "direction"), "neutral")}`),
      ),
      renderSetupDetails(candidate, dom),
    );
  });
  if (!rows.length) {
    dom.append(container, dom.el("p", { class: "empty-state" }, "스캐너를 실행하거나 종목을 검색하세요."));
    return;
  }
  dom.append(container, dom.el("div", { class: "scanner-result-list" }, rows));
}

export function renderScannerProgress(node, { completed = 0, total = 0 } = {}, { dom }) {
  const safeCompleted = safeText(completed, 0);
  const safeTotal = safeText(total, 0);
  node.setAttribute("max", String(safeTotal || 1));
  node.setAttribute("value", String(safeCompleted));
  dom.setText(node.nextElementSibling, `${safeCompleted} / ${safeTotal}`);
}
