import { safeText } from "./dom.js";

const MODES = ["common", "scalp", "day", "daily", "swing"];

function safeRead(value, key, fallback) {
  try {
    return value?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

function renderDiagnostic(diagnostic = {}, dom) {
  return dom.el("li", {}, `${safeText(safeRead(diagnostic, "kind"), "unknown")} · ${safeText(safeRead(diagnostic, "operation"), "unknown")}`);
}

export function renderManualAssetCard(container, asset = {}, { dom }) {
  const status = safeText(safeRead(asset, "status"), "idle");
  const ticker = safeRead(asset, "ticker", {});
  const modeResults = safeRead(asset, "modeResults", {});
  const diagnostics = safeRead(asset, "diagnostics", []);
  const error = safeRead(asset, "error", "");
  const card = dom.el("article", { class: `asset-card status-${status}` },
    dom.el("div", { class: "card-heading" },
      dom.el("div", {},
        dom.el("strong", {}, safeText(safeRead(asset, "symbol"), "Unknown")),
        dom.el("span", { class: "exchange-tag" }, safeText(safeRead(asset, "exchange"), "Bybit")),
      ),
      dom.el("span", { class: "status-label" }, status),
    ),
    dom.el("p", { class: "price" }, safeText(safeRead(ticker, "price"), "Price pending")),
    dom.el("div", { class: "mode-row" }, MODES.map((mode) =>
      dom.el("span", { class: safeRead(safeRead(modeResults, mode, {}), "eligible", false) ? "mode eligible" : "mode" }, mode))),
  );

  if (safeText(error)) {
    dom.append(card, dom.el("p", { class: "error-text" }, safeText(error)));
  }
  if (Array.isArray(diagnostics) && diagnostics.length) {
    dom.append(card, dom.el("details", { class: "diagnostics" },
      dom.el("summary", {}, "Diagnostics"),
      dom.el("ul", {}, diagnostics.map((item) => renderDiagnostic(item, dom))),
    ));
  }

  dom.append(container, card);
  return card;
}

export function renderManualAssets(container, assets = [], options) {
  options.dom.clear(container);
  if (assets.length === 0) {
    options.dom.append(container, options.dom.el("p", { class: "empty-state" }, "Add a symbol to begin monitoring."));
    return;
  }
  for (const asset of assets) {
    renderManualAssetCard(container, asset, options);
  }
}
