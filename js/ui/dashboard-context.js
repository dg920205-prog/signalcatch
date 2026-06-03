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
  return dom.svgEl("svg", { class: "context-mini-chart", viewBox: "0 0 100 40", "aria-label": `${safeRead(card, "symbol")} mini chart` },
    dom.svgEl("polyline", { points: points(safeRead(card, "series", [])) }),
  );
}

function renderStrengthMeter(value, dom) {
  const score = typeof value === "number" && Number.isFinite(value) ? Math.max(-100, Math.min(100, value)) : 0;
  return dom.el("div", { class: `context-meter ${score >= 0 ? "is-positive" : "is-negative"}` },
    dom.el("span", {}, `${score.toFixed(1)}`),
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
    renderStrengthMeter(safeRead(card, "score", 0), dom),
    dom.el("span", { class: "context-direction" }, safeRead(card, "direction", "● 중립")),
    dom.el("span", { class: "muted" }, safeRead(card, "interpretation", "")),
  );
}

function renderSatoshiLeaders(leaders, dom) {
  const rows = Array.isArray(leaders) ? leaders : [];
  return dom.el("section", { class: "satoshi-leaders" },
    dom.el("div", { class: "section-heading" },
      dom.el("h3", {}, "BTC 대비 강세 TOP"),
      dom.el("span", { class: "muted" }, "USDT 변화율을 BTC 흐름과 비교한 가벼운 상대강도"),
    ),
    rows.length
      ? dom.el("div", { class: "satoshi-leader-list" }, rows.map((leader) =>
          dom.el("div", { class: `satoshi-leader strength-${String(safeRead(leader, "label", "Neutral")).toLowerCase()}` },
            dom.el("strong", {}, safeRead(leader, "symbol", "UNKNOWN/BTC")),
            dom.el("span", {}, safeRead(leader, "label", "Neutral")),
            dom.el("span", {}, `${Number(safeRead(leader, "score", 0)).toFixed(1)}`),
          ),
        ))
      : dom.el("p", { class: "empty-state" }, "BTC 대비 강세 후보가 아직 없습니다."),
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
      dom.el("p", { class: "muted" }, `점수 기준: ${safeRead(context, "scoreNote", "4H trend + relative strength + breadth")}`),
      dom.el("p", { class: "muted" }, `참고 지표: ${(safeRead(context, "referenceIndicators", [])).join(", ")}`),
    ),
    dom.el("div", { class: "market-context-grid" }, cards.map((card) => renderCard(card, dom, onSelect))),
    renderSatoshiLeaders(safeRead(context, "satoshiLeaders", []), dom),
  );
}
