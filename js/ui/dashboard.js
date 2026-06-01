const TABS = ["manual", "scanner", "backtest", "auxiliary"];

export function setApiStatus(node, status, { dom }) {
  const normalized = ["ready", "loading", "error"].includes(status) ? status : "idle";
  node.className = `status status-${normalized}`;
  dom.setText(node, normalized === "ready" ? "API ready" : normalized === "loading" ? "Checking API" : normalized === "error" ? "API unavailable" : "API idle");
}

export function renderSummary(container, summary = {}, { dom }) {
  dom.clear(container);
  const cards = [
    ["Manual assets", summary.manualAssets ?? 0],
    ["Scanner results", summary.scannerResults ?? 0],
    ["Backtest trades", summary.backtestTrades ?? 0],
    ["API priority", "Bybit"],
  ];
  dom.append(container, cards.map(([label, value]) =>
    dom.el("article", { class: "summary-card" },
      dom.el("span", { class: "muted" }, label),
      dom.el("strong", {}, value),
    )));
}

export function activateTab(tab, root = document) {
  if (!TABS.includes(tab)) {
    return false;
  }
  for (const button of root.querySelectorAll("[data-tab]")) {
    const active = button.getAttribute("data-tab") === tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  }
  for (const panel of root.querySelectorAll("[data-panel]")) {
    panel.hidden = panel.getAttribute("data-panel") !== tab;
  }
  return true;
}

export function bindTabs(root = document) {
  for (const button of root.querySelectorAll("[data-tab]")) {
    button.addEventListener("click", () => activateTab(button.getAttribute("data-tab"), root));
  }
  activateTab("manual", root);
}
