import { safeText, snapshotArray } from "./dom.js";

function safeRead(value, key, fallback) {
  try {
    return value?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

export function renderAuxiliary(container, items = [], { dom }) {
  dom.clear(container);
  const snapshot = snapshotArray(items).values;
  if (snapshot.length === 0) {
    dom.append(container, dom.el("p", { class: "empty-state" }, "보조 시장 맥락이 여기에 표시됩니다.", dom.el("span", { hidden: true }, "Auxiliary market context")));
    return;
  }
  dom.append(container, snapshot.map((item) => dom.el("details", { class: "auxiliary-item" },
    dom.el("summary", {}, safeText(safeRead(item, "title"), "시장 맥락")),
    dom.el("p", {}, safeText(safeRead(item, "reason"), "상세 내용이 없습니다.")),
  )));
}
