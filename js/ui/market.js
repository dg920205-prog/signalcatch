import { formatPrice } from "./format.js";
import { safeText } from "./dom.js";

function safeRead(value, key, fallback) {
  try {
    return value?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

function strengthClass(label) {
  return `strength-${String(label ?? "Neutral").toLowerCase()}`;
}

function strengthText(label) {
  const value = String(label ?? "Neutral");
  if (value === "Strong") return "강세";
  if (value === "Weak") return "약세";
  if (value === "Neutral") return "중립";
  return value;
}

function scoreText(score) {
  return typeof score === "number" && Number.isFinite(score) ? score.toFixed(1) : "0.0";
}

function bubbleSizeClass(score) {
  const value = typeof score === "number" && Number.isFinite(score) ? Math.abs(score) : 0;
  if (value >= 60) return "heatmap-bubble-xl";
  if (value >= 30) return "heatmap-bubble-lg";
  return "heatmap-bubble-md";
}

export function renderMarketHeatmap(container, themes = {}, { dom, onSelect } = {}) {
  dom.clear(container);
  const entries = Object.entries(themes ?? {});
  if (!entries.length) {
    dom.append(container, dom.el("p", { class: "empty-state" }, "히트맵을 새로고침하면 시장 테마가 표시됩니다."));
    return;
  }
  const renderTile = (tile) =>
    dom.el(
      "button",
      {
        type: "button",
        class: `heatmap-bubble ${bubbleSizeClass(safeRead(tile, "score"))} ${strengthClass(safeRead(tile, "label", "Neutral"))}`,
        disabled: safeRead(tile, "status", "unavailable") !== "ready",
        onClick: () => onSelect?.(safeRead(tile, "symbol", "")),
      },
      dom.el("span", { class: "heatmap-symbol" }, safeText(safeRead(tile, "symbol"), "알 수 없음")),
      dom.el("span", { class: "heatmap-bubble-label" }, strengthText(safeRead(tile, "label"))),
      dom.el("span", { hidden: true }, safeText(safeRead(tile, "label"), "Neutral")),
      dom.el("strong", {}, scoreText(safeRead(tile, "score"))),
    );
  for (const [name, theme] of entries) {
    const tiles = Array.isArray(theme?.tiles) ? theme.tiles : [];
    const visibleTiles = tiles.slice(0, 5);
    const hiddenTiles = tiles.slice(5);
    dom.append(
      container,
      dom.el(
        "section",
        { class: `heatmap-theme heatmap-cluster ${strengthClass(safeRead(theme, "label", "Neutral"))}` },
        dom.el("div", { class: "section-heading" },
          dom.el("h3", {}, safeText(name, "테마")),
          dom.el("span", { class: `strength-badge ${strengthClass(safeRead(theme, "label", "Neutral"))}` },
            `${strengthText(safeRead(theme, "label"))} ${scoreText(safeRead(theme, "score"))}`),
          dom.el("span", { hidden: true }, safeText(safeRead(theme, "label"), "Neutral")),
        ),
        dom.el("div", { class: "heatmap-bubble-map" },
          visibleTiles.map(renderTile),
        ),
        hiddenTiles.length
          ? dom.el("details", { class: "heatmap-more" },
              dom.el("summary", {}, "전체 종목 보기"),
              dom.el("div", { class: "heatmap-bubble-map is-secondary" }, hiddenTiles.map(renderTile)),
            )
          : null,
      ),
    );
  }
}

function points(values) {
  const clean = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  if (!clean.length) return "";
  const minimum = Math.min(...clean);
  const maximum = Math.max(...clean);
  const spread = maximum - minimum || 1;
  return values.map((value, index) => {
    const x = values.length === 1 ? 0 : (index / (values.length - 1)) * 100;
    const y = typeof value === "number" && Number.isFinite(value)
      ? 100 - ((value - minimum) / spread) * 100
      : 100;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export function renderMarketChart(container, chart = {}, _setup, { dom }) {
  dom.clear(container);
  const prices = Array.isArray(chart?.prices) ? chart.prices.map(({ value }) => value) : [];
  if (!prices.length) {
    dom.append(container, dom.el("p", { class: "empty-state" }, "차트 데이터를 불러올 수 없습니다."));
    return;
  }
  dom.append(container, dom.svgEl("svg", { viewBox: "0 0 100 100", "aria-label": "시장 가격 차트" },
    dom.svgEl("polyline", { class: "chart-price", points: points(prices) }),
    dom.svgEl("polyline", { class: "chart-short-average", points: points(chart.shortAverage ?? []) }),
    dom.svgEl("polyline", { class: "chart-long-average", points: points(chart.longAverage ?? []) }),
  ));
}

function renderSetup(setup, dom) {
  const plan = safeRead(setup, "plan", null);
  if (!plan) return dom.el("p", { class: "empty-state" }, "사용 가능한 셋업이 없습니다.");
  return dom.el("div", { class: "market-setup-card" },
    dom.el("strong", {}, `추천 셋업 ${safeText(safeRead(setup, "mode"), "common")}`),
    dom.el("span", {}, `방향 ${safeText(safeRead(setup, "direction"), "neutral")}`),
    dom.el("span", {}, `진입 ${formatPrice(safeRead(plan, "entryLow"))} ~ ${formatPrice(safeRead(plan, "entryHigh"))}`),
    dom.el("span", { class: "split-sl" }, `SL ${formatPrice(safeRead(plan, "sl"))}`),
    dom.el("span", { class: "split-tp" }, `TP ${formatPrice(safeRead(plan, "tp"))}`),
  );
}

function renderOtherSetups(setups, selectedMode, dom) {
  const rows = Object.values(setups ?? {}).filter((setup) => setup?.mode !== selectedMode);
  return dom.el("details", { class: "scanner-setups" },
    dom.el("summary", {}, "다른 타임프레임 셋업", dom.el("span", { hidden: true }, "Other timeframe setups")),
    rows.length
      ? dom.el("div", { class: "other-setup-grid" }, rows.map((setup) => renderSetup(setup, dom)))
      : dom.el("p", { class: "muted" }, "추가 타임프레임 셋업이 없습니다."),
  );
}

export function renderMarketDetail(container, detail = {}, { dom, onTimeframe } = {}) {
  dom.clear(container);
  const timeframe = safeText(safeRead(detail, "timeframe"), "4H");
  const chart = dom.el("div", { class: "market-chart chart-container" });
  renderMarketChart(chart, safeRead(detail, "chart", {}), safeRead(detail, "setup", null), { dom });
  dom.append(container,
    dom.el("div", { class: "section-heading" },
      dom.el("h3", {}, `${safeText(safeRead(detail, "symbol"), "알 수 없음")} 차트 브리핑`),
      dom.el("div", { class: "timeframe-row" },
        ["1H", "4H", "1D"].map((value) =>
          dom.el("button", {
            type: "button",
            class: value === timeframe ? "is-active" : "",
            onClick: () => onTimeframe?.(value),
          }, value),
        ),
      ),
    ),
    chart,
    dom.el("p", { class: "briefing-card" }, safeText(safeRead(detail, "briefing"), "브리핑을 불러올 수 없습니다.")),
    renderSetup(safeRead(detail, "setup", null), dom),
    renderOtherSetups(safeRead(detail, "setups", {}), safeRead(safeRead(detail, "setup", {}), "mode", ""), dom),
  );
}
