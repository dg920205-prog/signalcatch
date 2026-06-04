import { safeText, snapshotArray } from "./dom.js";
import { formatPrice } from "./format.js";
import { recommendationBadge } from "./recommendation-badge.js";

const STATUS_LABEL = {
  loading: "로딩 중",
  ready: "정상",
  error: "오류",
  idle: "대기",
};

const MODES = ["common", "scalp", "day", "daily", "swing"];

function safeRead(value, key, fallback) {
  try {
    return value?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

function renderDiagnostic(diagnostic = {}, dom) {
  return dom.el(
    "li",
    {},
    `${safeText(safeRead(diagnostic, "kind"), "unknown")} | ${safeText(safeRead(diagnostic, "operation"), "unknown")}`,
  );
}

function visibleErrorText(error) {
  const text = safeText(error, "");
  return text === "Some asset data could not be loaded."
    ? "일부 종목 데이터를 불러오지 못했습니다."
    : text;
}

export function renderManualAssetCard(container, asset = {}, { dom }) {
  const status = safeText(safeRead(asset, "status"), "idle");
  const ticker = safeRead(asset, "ticker", {});
  const tickerPrice = safeRead(ticker, "price", null);
  const modeResults = safeRead(asset, "modeResults", {});
  const diagnostics = safeRead(asset, "diagnostics", []);
  const error = safeRead(asset, "error", "");
  const recommendation = safeRead(asset, "recommendation", {});
  const plan = safeRead(recommendation, "plan", null);
  const split = safeRead(recommendation, "split", null);
  const quality = recommendationBadge(safeRead(recommendation, "label"));
  const notes = snapshotArray(safeRead(recommendation, "notes", []), 3).values;

  const card = dom.el(
    "article",
    { class: `asset-card status-${status}` },
    dom.el(
      "div",
      { class: "card-heading" },
      dom.el(
        "div",
        {},
        dom.el("strong", {}, safeText(safeRead(asset, "symbol"), "알 수 없음")),
        dom.el("span", { class: "exchange-tag" }, safeText(safeRead(asset, "exchange"), "Bybit")),
      ),
      dom.el("span", { class: "status-label" }, STATUS_LABEL[status] ?? status),
    ),
    dom.el("p", { class: "price" }, typeof tickerPrice === "number" ? formatPrice(tickerPrice) : safeText(tickerPrice, "가격 대기 중")),
    dom.el("p", { class: "quality-line" }, `진입 품질: ${quality}`),
    dom.el(
      "div",
      { class: "mode-row" },
      MODES.map((mode) =>
        dom.el(
          "span",
          { class: safeRead(safeRead(modeResults, mode, {}), "eligible", false) ? "mode eligible" : "mode" },
          mode,
        ),
      ),
    ),
  );

  if (plan) {
    dom.append(
      card,
      dom.el(
        "div",
        { class: "plan-row" },
        dom.el("span", {}, `진입 ${formatPrice(plan.entryLow)} ~ ${formatPrice(plan.entryHigh)}`),
        dom.el("span", {}, `손절 ${formatPrice(plan.sl)}`),
        dom.el("span", {}, `목표 ${formatPrice(plan.tp)}`),
      ),
    );
  }

  if (split?.entries?.length && split?.targets?.length) {
    dom.append(
      card,
      dom.el(
        "details",
        { class: "diagnostics" },
        dom.el("summary", {}, "분할 진입/익절 (데일리·스윙 백테스트 반영)"),
        dom.el(
          "p",
          {},
          `진입 ${split.entries
            .map((entry) => `${entry.label} ${formatPrice(entry.price)} (${entry.weightPct}%)`)
            .join(", ")}`,
        ),
        dom.el(
          "p",
          {},
          `익절 ${split.targets
            .map((target) => `${target.label} ${formatPrice(target.price)} (${target.weightPct}%)`)
            .join(", ")}`,
        ),
      ),
    );
  }

  if (notes.length) {
    dom.append(
      card,
      dom.el(
        "p",
        { class: "muted" },
        notes.map((note) => safeText(note, "")).join(" | "),
      ),
    );
  }

  if (safeText(error)) {
    dom.append(card, dom.el("p", { class: "error-text" }, visibleErrorText(error)));
  }
  const diagnosticItems = snapshotArray(diagnostics, 20).values;
  if (diagnosticItems.length) {
    dom.append(
      card,
      dom.el(
        "details",
        { class: "diagnostics" },
        dom.el("summary", {}, "진단"),
        dom.el("ul", {}, diagnosticItems.map((item) => renderDiagnostic(item, dom))),
      ),
    );
  }

  dom.append(container, card);
  return card;
}

export function renderManualAssets(container, assets = [], options) {
  options.dom.clear(container);
  const items = snapshotArray(assets).values;
  if (items.length === 0) {
    options.dom.append(
      container,
      options.dom.el("p", { class: "empty-state" }, "종목을 추가하면 모니터링을 시작합니다.", options.dom.el("span", { hidden: true }, "Add a symbol")),
    );
    return;
  }
  for (const asset of items) {
    renderManualAssetCard(container, asset, options);
  }
}
