const MODES = ["common", "scalp", "day", "daily", "swing"];

function renderDiagnostic(diagnostic = {}, dom) {
  return dom.el("li", {}, `${diagnostic.kind ?? "unknown"} · ${diagnostic.operation ?? "unknown"}`);
}

export function renderManualAssetCard(container, asset = {}, { dom }) {
  const card = dom.el("article", { class: `asset-card status-${asset.status ?? "idle"}` },
    dom.el("div", { class: "card-heading" },
      dom.el("div", {},
        dom.el("strong", {}, asset.symbol ?? "Unknown"),
        dom.el("span", { class: "exchange-tag" }, asset.exchange ?? "Bybit"),
      ),
      dom.el("span", { class: "status-label" }, asset.status ?? "idle"),
    ),
    dom.el("p", { class: "price" }, asset.ticker?.price ?? "Price pending"),
    dom.el("div", { class: "mode-row" }, MODES.map((mode) =>
      dom.el("span", { class: asset.modeResults?.[mode]?.eligible ? "mode eligible" : "mode" }, mode))),
  );

  if (asset.error) {
    dom.append(card, dom.el("p", { class: "error-text" }, asset.error));
  }
  if (asset.diagnostics?.length) {
    dom.append(card, dom.el("details", { class: "diagnostics" },
      dom.el("summary", {}, "Diagnostics"),
      dom.el("ul", {}, asset.diagnostics.map((item) => renderDiagnostic(item, dom))),
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
