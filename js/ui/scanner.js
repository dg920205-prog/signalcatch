const MODES = ["common", "scalp", "day", "daily", "swing"];

export function renderScannerResults(container, candidates = [], { dom }) {
  dom.clear(container);
  const body = dom.el("tbody");
  for (const candidate of candidates) {
    dom.append(body, dom.el("tr", {},
      dom.el("td", {}, candidate.symbol ?? "Unknown"),
      dom.el("td", {}, candidate.exchange ?? "Bybit"),
      dom.el("td", {}, candidate.status ?? "idle"),
      ...MODES.map((mode) => dom.el("td", {}, candidate.modeResults?.[mode]?.eligible ? "Signal" : "-")),
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
  node.setAttribute("max", String(total || 1));
  node.setAttribute("value", String(completed));
  dom.setText(node.nextElementSibling, `${completed} / ${total}`);
}
