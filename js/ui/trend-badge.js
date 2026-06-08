const TREND_BADGES = {
  strong_bull: "🟢 강세",
  weak_bull: "🟢 약",
  neutral: "⚪ 중립",
  weak_bear: "🔴 약",
  strong_bear: "🔴 강세",
  insufficient_data: "⚪ 데이터 부족",
};

export function trendBadgeText(trendGating) {
  if (!trendGating || typeof trendGating !== "object") return null;
  return TREND_BADGES[trendGating.state] ?? null;
}

export function btcOverlayMark(trendGating) {
  if (!trendGating || trendGating.btcOverlayApplied !== true) return null;
  return "⚡ BTC 보정";
}

export function trendMultiplierText(trendGating) {
  if (!trendGating || typeof trendGating.multiplier !== "number") return null;
  if (trendGating.multiplier === 1.0) return null;
  return `점수 ×${trendGating.multiplier.toFixed(2)}`;
}

const STRUCTURE_BADGES = {
  bullish_structure: "📊 강세 구조",
  bearish_structure: "📊 약세 구조",
  mixed: "📊 혼조",
  unknown: null,
};

export function structureBadgeText(structureGating) {
  if (!structureGating || typeof structureGating !== "object") return null;
  return STRUCTURE_BADGES[structureGating.state] ?? null;
}

export function structureMultiplierText(structureGating) {
  if (!structureGating || typeof structureGating.multiplier !== "number") return null;
  if (structureGating.multiplier === 1.0) return null;
  return `구조 ×${structureGating.multiplier.toFixed(2)}`;
}

const CVD_BADGES = {
  bullish_divergence: "↗️ CVD 강세",
  bearish_divergence: "↘️ CVD 약세",
  none: null,
  insufficient_data: null,
};

export function cvdBadgeText(cvdGating) {
  if (!cvdGating || typeof cvdGating !== "object") return null;
  return CVD_BADGES[cvdGating.state] ?? null;
}

export function cvdMultiplierText(cvdGating) {
  if (!cvdGating || typeof cvdGating.multiplier !== "number") return null;
  if (cvdGating.multiplier === 1.0) return null;
  return `CVD ×${cvdGating.multiplier.toFixed(2)}`;
}

const STOCH_RSI_BADGES = {
  embedded_ob: "🔋 강세 임베드",
  embedded_ob_exit: "🪫 강세 임베드 종료",
  embedded_os: "🔋 약세 임베드",
  embedded_os_exit: "🪫 약세 임베드 종료",
  normal: null,
  insufficient_data: null,
};

export function stochRsiBadgeText(stochRsiGating) {
  if (!stochRsiGating || typeof stochRsiGating !== "object") return null;
  return STOCH_RSI_BADGES[stochRsiGating.state] ?? null;
}

export function stochRsiMultiplierText(stochRsiGating) {
  if (!stochRsiGating || typeof stochRsiGating.multiplier !== "number") return null;
  if (stochRsiGating.multiplier === 1.0) return null;
  return `StochRSI ×${stochRsiGating.multiplier.toFixed(2)}`;
}

const STOCH_RSI_DIVERGENCE_BADGES = {
  bullish_hl: "📈 짝궁둥이",
  bearish_lh: "📉 짝두",
};

export function stochRsiDivergenceBadgeText(stochRsiDivergence) {
  if (!stochRsiDivergence || typeof stochRsiDivergence !== "object") return null;
  if (stochRsiDivergence.confidenceBoost !== 1) return null;
  return STOCH_RSI_DIVERGENCE_BADGES[stochRsiDivergence.state] ?? null;
}

const ICT_ZONE_KIND_LABELS = {
  bpr: "💎 BPR",
  ob: "🟦 OB",
  fvg: "🟧 FVG",
};

export function ictZoneBadgeText(ictPlan) {
  if (!ictPlan || typeof ictPlan !== "object") return "";
  if (ictPlan.status !== "ready") return "";
  const label = ICT_ZONE_KIND_LABELS[ictPlan.zoneKind] ?? "";
  if (!label) return "";
  if (ictPlan.zoneKind !== "bpr") return label;
  const conf = ictPlan.confidence;
  return typeof conf === "number" && Number.isFinite(conf)
    ? `${label} · 신뢰도 ${conf}`
    : label;
}

export function ictWaitingText(ictPlan) {
  if (!ictPlan || typeof ictPlan !== "object") return "";
  return ictPlan.status === "waiting" ? "⏳ 진입 대기" : "";
}
