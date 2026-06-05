import { safeText, snapshotArray } from "./dom.js";
import { formatPrice } from "./format.js";
import { selectStrongestSetup } from "../analysis/market-heatmap.js";
import { recommendationBadge } from "./recommendation-badge.js";
import { MODE_CONFIG } from "../config.js";
import { trendBadgeText, btcOverlayMark, trendMultiplierText, structureBadgeText, structureMultiplierText } from "./trend-badge.js";

const DIRECTION_LABEL = { bull: "상승", bear: "하락", neutral: "중립" };
const MODES = ["common", "scalp", "day", "daily", "swing"];
const GROUPS = [
  { key: "recommended", label: "추천", icon: "✅", labels: new Set(["추천"]) },
  { key: "watch", label: "주의", icon: "⚠️", labels: new Set(["주의"]) },
  { key: "avoid", label: "비추천", icon: "⛔", labels: new Set(["비추천"]) },
];

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

function recommendationGroup(label) {
  return GROUPS.find((group) => group.labels.has(label)) ?? GROUPS[2];
}

function metricText(label, value, suffix = "") {
  return typeof value === "number" && Number.isFinite(value)
    ? `${label} ${value.toFixed(label === "추세" ? 3 : 1)}${suffix}`
    : `${label} -`;
}

function renderSetupExplanation(setup, plan, dom) {
  const analysis = safeRead(setup, "analysis", {});
  const reasons = snapshotArray(safeRead(analysis, "reasons", []), 3).values;
  return dom.el("div", { class: "setup-explain" },
    dom.el("strong", {}, "산출 기준"),
    dom.el("div", { class: "setup-criteria" },
      dom.el("span", {}, "진입: 현재가와 ATR 0.5 구간"),
      dom.el("span", {}, "SL: ATR 1.0 방어선"),
      dom.el("span", {}, "TP: ATR 1.5 목표선"),
      dom.el("span", {}, plan ? `ATR ${formatPrice(safeRead(analysis, "atr"))}` : "ATR -"),
    ),
    dom.el("div", { class: "setup-metrics" },
      dom.el("span", {}, metricText("신뢰도", safeRead(analysis, "confidence"), "%")),
      dom.el("span", {}, metricText("거래량", safeRead(analysis, "volumeRatio"))),
      dom.el("span", {}, metricText("추세", safeRead(analysis, "trendStrength"))),
    ),
    dom.el("ul", { class: "setup-reasons" },
      reasons.length
        ? reasons.map((reason) => dom.el("li", {}, safeText(reason, "-")))
        : dom.el("li", {}, "근거 데이터가 부족합니다."),
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
        dom.el("strong", {}, MODE_CONFIG[mode]?.label ?? mode),
        dom.el("span", { hidden: true }, mode),
        dom.el("span", { class: "recommendation-badge" }, recommendationBadge(safeRead(recommendation, "label"))),
      ),
      dom.el("div", { class: "setup-card-meta" },
        dom.el("span", {}, `방향 ${DIRECTION_LABEL[safeRead(setup, "direction")] ?? "중립"}`),
        (() => {
          const badge = trendBadgeText(safeRead(setup, "trendGating"));
          return badge ? dom.el("span", { class: "trend-badge" }, `HTF ${badge}`) : null;
        })(),
        (() => {
          const mark = btcOverlayMark(safeRead(setup, "trendGating"));
          return mark ? dom.el("span", { class: "trend-btc-overlay" }, mark) : null;
        })(),
        (() => {
          const mult = trendMultiplierText(safeRead(setup, "trendGating"));
          return mult ? dom.el("span", { class: "trend-multiplier" }, mult) : null;
        })(),
        (() => {
          const badge = structureBadgeText(safeRead(setup, "structureGating"));
          return badge ? dom.el("span", { class: "structure-badge" }, badge) : null;
        })(),
        (() => {
          const mult = structureMultiplierText(safeRead(setup, "structureGating"));
          return mult ? dom.el("span", { class: "structure-multiplier" }, mult) : null;
        })(),
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
      renderSetupExplanation(setup, plan, dom),
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

export function renderScannerResults(container, candidates = [], { dom, onBacktestSelect } = {}) {
  dom.clear(container);
  const rows = snapshotArray(candidates).values.map((candidate) => {
    const symbol = safeText(safeRead(candidate, "symbol"), "알 수 없음");
    const bestSetup = selectStrongestSetup(safeRead(candidate, "setups", {}));
    const group = recommendationGroup(safeRead(safeRead(bestSetup, "recommendation", {}), "label"));
    return {
      group,
      node: dom.el("article", { class: "scanner-result-card" },
      dom.el("div", { class: "scanner-result-head" },
        dom.el("strong", {}, symbol),
        dom.el("span", { class: "recommendation-badge" },
          recommendationBadge(safeRead(safeRead(bestSetup, "recommendation", {}), "label"))),
        dom.el("button", {
          type: "button",
          class: "scanner-backtest-button",
          onClick: () => {
            if (typeof onBacktestSelect === "function") onBacktestSelect(symbol);
          },
        }, "이 종목 백테스트"),
      ),
      dom.el("div", { class: "scanner-result-summary" },
        dom.el("span", {}, `현재가 ${formatPrice(safeRead(candidate, "price"))}`),
        dom.el("span", {}, `셋업 ${MODE_CONFIG[safeRead(bestSetup, "mode")]?.label ?? "-"}`),
        dom.el("span", { hidden: true }, safeText(safeRead(bestSetup, "mode"), "")),
        dom.el("span", {}, `방향 ${DIRECTION_LABEL[safeRead(bestSetup, "direction")] ?? "중립"}`),
        (() => {
          const badge = trendBadgeText(safeRead(bestSetup, "trendGating"));
          return badge ? dom.el("span", { class: "trend-badge" }, badge) : null;
        })(),
        (() => {
          const mark = btcOverlayMark(safeRead(bestSetup, "trendGating"));
          return mark ? dom.el("span", { class: "trend-btc-overlay" }, mark) : null;
        })(),
        (() => {
          const badge = structureBadgeText(safeRead(bestSetup, "structureGating"));
          return badge ? dom.el("span", { class: "structure-badge" }, badge) : null;
        })(),
      ),
      renderSetupDetails(candidate, dom),
      ),
    };
  });
  if (!rows.length) {
    dom.append(container, dom.el("p", { class: "empty-state" }, "스캐너를 실행하거나 종목을 검색하세요."));
    return;
  }
  const groupNodes = [];
  const applyFilter = (key) => {
    groupNodes.forEach(({ group, node }) => {
      node.hidden = key !== "all" && group.key !== key;
    });
  };
  const renderedGroups = GROUPS.map((group) => {
    const groupRows = rows.filter((row) => row.group.key === group.key);
    if (!groupRows.length) return null;
    const node = dom.el("details", { class: `scanner-result-group group-${group.key}`, open: true },
      dom.el("summary", {}, `${group.icon} ${group.label} ${groupRows.length}`),
      dom.el("div", { class: "scanner-result-group-list" }, groupRows.map((row) => row.node)),
    );
    groupNodes.push({ group, node });
    return node;
  });
  dom.append(container,
    dom.el("div", { class: "scanner-filter-bar" },
      dom.el("button", {
        type: "button",
        class: "scanner-filter-pill group-all",
        onClick: () => applyFilter("all"),
      }, `전체 ${rows.length}`),
      GROUPS.map((group) => {
        const count = rows.filter((row) => row.group.key === group.key).length;
        return dom.el("button", {
          type: "button",
          class: `scanner-filter-pill group-${group.key}`,
          onClick: () => applyFilter(group.key),
        }, `${group.icon} ${group.label} ${count}`);
      }),
    ),
    dom.el("div", { class: "scanner-result-list" }, renderedGroups),
  );
}

export function renderScannerProgress(node, { completed = 0, total = 0 } = {}, { dom }) {
  const safeCompleted = safeText(completed, 0);
  const safeTotal = safeText(total, 0);
  node.setAttribute("max", String(safeTotal || 1));
  node.setAttribute("value", String(safeCompleted));
  dom.setText(node.nextElementSibling, `${safeCompleted} / ${safeTotal}`);
}
