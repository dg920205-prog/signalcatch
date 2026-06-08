import { stochRsi } from "./indicators.js";
import { STOCHRSI_GATING } from "../config.js";

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function computeStochRsiState({ candles, gating = STOCHRSI_GATING } = {}) {
  if (
    !Array.isArray(candles) ||
    candles.length < gating.rsiPeriod + gating.stochPeriod + gating.kSmooth + gating.dSmooth
  ) {
    return { state: "insufficient_data", k: null, d: null, recentKs: [] };
  }

  const closes = candles
    .map((candle) => (candle && isFiniteNumber(candle.close) ? candle.close : null))
    .filter((value) => value !== null);
  const result = stochRsi(
    closes,
    gating.rsiPeriod,
    gating.stochPeriod,
    gating.kSmooth,
    gating.dSmooth,
  );

  if (!result || !Array.isArray(result.kSeries)) {
    return { state: "insufficient_data", k: null, d: null, recentKs: [] };
  }

  const kSeries = result.kSeries.filter(isFiniteNumber);
  if (kSeries.length < gating.embeddedWindow) {
    return { state: "insufficient_data", k: result.k, d: result.d, recentKs: kSeries };
  }

  const recentKs = kSeries.slice(-gating.embeddedWindow);
  const k = result.k;
  const prevK = kSeries[kSeries.length - 2];

  if (isFiniteNumber(prevK) && isFiniteNumber(k)) {
    if (prevK > gating.obThreshold && k <= gating.obThreshold) {
      return { state: "embedded_ob_exit", k, d: result.d, recentKs };
    }
    if (prevK < gating.osThreshold && k >= gating.osThreshold) {
      return { state: "embedded_os_exit", k, d: result.d, recentKs };
    }
  }

  const obCount = recentKs.filter((value) => value > gating.obThreshold).length;
  const osCount = recentKs.filter((value) => value < gating.osThreshold).length;
  if (obCount >= gating.embeddedMinCount) {
    return { state: "embedded_ob", k, d: result.d, recentKs };
  }
  if (osCount >= gating.embeddedMinCount) {
    return { state: "embedded_os", k, d: result.d, recentKs };
  }

  return { state: "normal", k, d: result.d, recentKs };
}

export function applyStochRsiMultiplier(analysis, stochRsiState, gating = STOCHRSI_GATING) {
  if (!analysis || typeof analysis !== "object" || !stochRsiState) return analysis;

  let multiplier = 1.0;
  const state = stochRsiState.state;
  const direction = analysis.direction;
  if (state === "embedded_ob" && direction === "bear") {
    multiplier = gating.embeddedPenalty;
  } else if (state === "embedded_os" && direction === "bull") {
    multiplier = gating.embeddedPenalty;
  } else if (state === "embedded_ob_exit" && direction === "bear") {
    multiplier = gating.exitMultiplier;
  } else if (state === "embedded_os_exit" && direction === "bull") {
    multiplier = gating.exitMultiplier;
  }

  const baseScore = isFiniteNumber(analysis.score) ? analysis.score : 0;
  return {
    ...analysis,
    score: baseScore * multiplier,
    scoreBreakdown: { ...(analysis.scoreBreakdown ?? {}), stochRsiMultiplier: multiplier },
  };
}
