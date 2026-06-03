import { tradingViewReferenceUrl } from "./tradingview.js";

function safeRead(value, key, fallback) {
  try {
    return value?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

function points(values) {
  const clean = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (clean.length < 2) return "";
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const spread = max - min || 1;
  return clean.map((value, index) => {
    const x = (index / (clean.length - 1)) * 100;
    const y = 36 - ((value - min) / spread) * 30;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

function renderMiniChart(card, dom) {
  if (safeRead(card, "source") === "reference") {
    return dom.el("iframe", {
      class: "context-mini-frame",
      src: tradingViewReferenceUrl(safeRead(card, "symbol"), { compact: true }),
      loading: "lazy",
      referrerpolicy: "no-referrer-when-downgrade",
      title: `${safeRead(card, "symbol")} TradingView reference`,
    });
  }
  return dom.svgEl("svg", { class: "context-mini-chart", viewBox: "0 0 100 40", "aria-label": `${safeRead(card, "symbol")} mini chart` },
    dom.svgEl("polyline", { points: points(safeRead(card, "series", [])) }),
  );
}

function renderCard(card, dom, onSelect) {
  const source = safeRead(card, "source") === "reference" ? "시각 참고" : "자동 반영";
  return dom.el("button", {
    type: "button",
    class: "market-context-card",
    onClick: () => onSelect?.(safeRead(card, "symbol")),
  },
    dom.el("span", { class: "context-card-top" },
      dom.el("strong", {}, safeRead(card, "symbol", "Unknown")),
      dom.el("span", { class: "source-badge" }, source),
    ),
    renderMiniChart(card, dom),
    dom.el("span", { class: "context-direction" }, safeRead(card, "direction", "● 중립")),
    dom.el("span", { class: "muted" }, safeRead(card, "interpretation", "")),
  );
}

export function renderDashboardContext(container, context = {}, { dom, onSelect } = {}) {
  dom.clear(container);
  const cards = Array.isArray(context?.cards) ? context.cards : [];
  dom.append(container,
    dom.el("div", { class: "context-banner" },
      dom.el("div", {},
        dom.el("p", { class: "eyebrow" }, "MARKET DIRECTION"),
        dom.el("h2", {}, safeRead(context, "label", "시장 방향성 대기")),
      ),
      dom.el("p", { class: "muted" }, `자동 반영: ${(safeRead(context, "automatedInputs", [])).join(", ")}`),
      dom.el("p", { class: "muted" }, `시각 참고: ${(safeRead(context, "referenceIndicators", [])).join(", ")}`),
    ),
    dom.el("div", { class: "market-context-grid" }, cards.map((card) => renderCard(card, dom, onSelect))),
    dom.el("div", { class: "context-reference-chart" },
      dom.el("iframe", {
        src: tradingViewReferenceUrl(safeRead(cards[0], "symbol", "BTC")),
        loading: "lazy",
        referrerpolicy: "no-referrer-when-downgrade",
        title: "Selected TradingView reference chart",
      }),
    ),
  );
}
