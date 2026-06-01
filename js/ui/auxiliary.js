import { safeText } from "./dom.js";

function safeRead(value, key, fallback) {
  try {
    return value?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

export function renderAuxiliary(container, items = [], { dom }) {
  dom.clear(container);
  if (items.length === 0) {
    dom.append(container, dom.el("p", { class: "empty-state" }, "Auxiliary market context will appear here."));
    return;
  }
  dom.append(container, items.map((item) => dom.el("details", { class: "auxiliary-item" },
    dom.el("summary", {}, safeText(safeRead(item, "title"), "Market context")),
    dom.el("p", {}, safeText(safeRead(item, "reason"), "No detail available.")),
  )));
}
