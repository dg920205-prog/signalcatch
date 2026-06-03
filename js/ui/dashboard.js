import { safeText } from "./dom.js";

const TABS = ["manual", "scanner", "market", "backtest"];

function safeRead(value, key, fallback) {
  try {
    return value?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

export function setApiStatus(node, status, { dom }) {
  const normalized = ["ready", "loading", "error"].includes(status) ? status : "idle";
  node.className = `status status-${normalized}`;
  dom.setText(node, normalized === "ready" ? "API 정상" : normalized === "loading" ? "API 확인 중" : normalized === "error" ? "API 오류" : "API 대기");
}

export function renderSummary(container, summary = {}, { dom }) {
  dom.clear(container);
  const lastRefreshIso = safeRead(summary, "lastRefreshIso", "");
  const refreshedAt = Date.parse(lastRefreshIso);
  const secondsAgo = Number.isFinite(refreshedAt)
    ? Math.max(0, Math.floor((Date.now() - refreshedAt) / 1000))
    : null;
  const refreshText = secondsAgo === null
    ? "없음"
    : secondsAgo >= 60
      ? `${Math.floor(secondsAgo / 60)}분 전`
      : `${secondsAgo}초 전`;
  const cards = [
    ["관심 종목", safeText(safeRead(summary, "manualAssets", 0), 0)],
    ["스캐너 결과", safeText(safeRead(summary, "scannerResults", 0), 0)],
    ["추천 시그널", safeText(safeRead(summary, "recommendedCount", 0), 0)],
    ["마지막 갱신", refreshText],
  ];
  dom.append(container, cards.map(([label, value]) =>
    dom.el("article", { class: "summary-card" },
      label === "관심 종목" ? dom.el("span", { hidden: true }, "Manual assets") : null,
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

export function bindTabs(root = document, options = {}) {
  const buttons = [...root.querySelectorAll("[data-tab]")];
  const initialTab = TABS.includes(options.initialTab) ? options.initialTab : "manual";
  const onChange = typeof options.onChange === "function" ? options.onChange : () => {};
  for (const [index, button] of buttons.entries()) {
    button.addEventListener("click", () => {
      const tab = button.getAttribute("data-tab");
      if (activateTab(tab, root)) onChange(tab);
    });
    button.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = buttons[(index + direction + buttons.length) % buttons.length];
      const tab = next.getAttribute("data-tab");
      if (activateTab(tab, root)) onChange(tab);
      next.focus();
    });
  }
  activateTab(initialTab, root);
}
