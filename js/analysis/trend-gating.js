import { adx, ema } from "./indicators.js";
import { TREND_GATING, STRUCTURE_GATING, CVD_GATING } from "../config.js";

export const TREND_STATES = Object.freeze({
  STRONG_BULL: "strong_bull",
  WEAK_BULL: "weak_bull",
  NEUTRAL: "neutral",
  WEAK_BEAR: "weak_bear",
  STRONG_BEAR: "strong_bear",
  INSUFFICIENT_DATA: "insufficient_data",
});

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function safeNumberOption(value, fallback) {
  return isFiniteNumber(value) && value > 0 ? value : fallback;
}

export function computeTrendState({
  candles,
  longEmaPeriod = 200,
  shortEmaPeriod = 50,
  adxPeriod = TREND_GATING.adxPeriod,
  adxStrongThreshold = TREND_GATING.adxStrongThreshold,
  adxRangingThreshold = TREND_GATING.adxRangingThreshold,
  neutralBandPct = TREND_GATING.neutralBandPct,
} = {}) {
  if (!Array.isArray(candles)) {
    return { state: TREND_STATES.INSUFFICIENT_DATA, details: { reason: "no_candles" } };
  }

  const longPeriod = safeNumberOption(longEmaPeriod, 200);
  const shortPeriod = safeNumberOption(shortEmaPeriod, 50);
  const adxN = safeNumberOption(adxPeriod, 14);

  if (candles.length < longPeriod + 1 || candles.length < 2 * adxN + 1) {
    return { state: TREND_STATES.INSUFFICIENT_DATA, details: { reason: "insufficient_candles" } };
  }

  const closes = candles.map((c) => c?.close);
  const close = closes.at(-1);
  const longEma = ema(closes, longPeriod);
  const shortEma = ema(closes, shortPeriod);
  const currentAdx = adx(candles, adxN);

  if (![close, longEma, shortEma, currentAdx].every(isFiniteNumber)) {
    return { state: TREND_STATES.INSUFFICIENT_DATA, details: { reason: "indicator_failure" } };
  }

  const band = longEma * neutralBandPct;
  const aboveLong = close > longEma + band;
  const belowLong = close < longEma - band;
  const shortAboveLong = shortEma > longEma;
  const strongTrend = currentAdx >= adxStrongThreshold;
  const ranging = currentAdx < adxRangingThreshold;

  let state;
  if (ranging) {
    state = TREND_STATES.NEUTRAL;
  } else if (aboveLong && shortAboveLong && strongTrend) {
    state = TREND_STATES.STRONG_BULL;
  } else if (aboveLong) {
    state = TREND_STATES.WEAK_BULL;
  } else if (belowLong && !shortAboveLong && strongTrend) {
    state = TREND_STATES.STRONG_BEAR;
  } else if (belowLong) {
    state = TREND_STATES.WEAK_BEAR;
  } else {
    state = TREND_STATES.NEUTRAL;
  }

  return {
    state,
    details: { close, longEma, shortEma, adx: currentAdx },
  };
}

export function applyTrendMultiplier(analysis, trendState, btcContext = null) {
  if (!analysis || typeof analysis !== "object") {
    return analysis;
  }
  const direction = analysis.direction;
  if (direction !== "bull" && direction !== "bear") {
    return { ...analysis, trendState, trendMultiplier: 1.0, btcOverlayApplied: false };
  }

  const directionKey = direction === "bull" ? "long" : "short";
  const stateKey = trendState ?? TREND_STATES.INSUFFICIENT_DATA;
  const baseMultiplier = TREND_GATING.multipliers[directionKey]?.[stateKey] ?? 1.0;

  let btcMultiplier = 1.0;
  let btcOverlayApplied = false;
  if (btcContext && btcContext.isBtc === false && typeof btcContext.state === "string") {
    if (direction === "bull" && btcContext.state === TREND_STATES.STRONG_BEAR) {
      btcMultiplier = TREND_GATING.btcOverlayPenalty;
      btcOverlayApplied = true;
    }
    if (direction === "bear" && btcContext.state === TREND_STATES.STRONG_BULL) {
      btcMultiplier = TREND_GATING.btcOverlayPenalty;
      btcOverlayApplied = true;
    }
  }

  const finalMultiplier = baseMultiplier * btcMultiplier;
  const baseScore = isFiniteNumber(analysis.score) ? analysis.score : 0;
  const newScore = baseScore * finalMultiplier;
  const newConfidence = Math.min(Math.abs(newScore), 100);

  return {
    ...analysis,
    score: newScore,
    confidence: newConfidence,
    trendState: stateKey,
    trendMultiplier: finalMultiplier,
    btcOverlayApplied,
  };
}

export function applyStructureMultiplier(analysis, structureState) {
  if (!analysis || typeof analysis !== "object") {
    return analysis;
  }
  const direction = analysis.direction;
  const stateKey = structureState ?? "unknown";

  if (direction !== "bull" && direction !== "bear") {
    return {
      ...analysis,
      structureState: stateKey,
      structureMultiplier: 1.0,
    };
  }

  const directionKey = direction === "bull" ? "long" : "short";
  const mult = STRUCTURE_GATING.multipliers[directionKey]?.[stateKey] ?? 1.0;

  const baseScore = isFiniteNumber(analysis.score) ? analysis.score : 0;
  const newScore = baseScore * mult;
  const newConfidence = Math.min(Math.abs(newScore), 100);

  return {
    ...analysis,
    score: newScore,
    confidence: newConfidence,
    structureState: stateKey,
    structureMultiplier: mult,
  };
}

export function applyCvdMultiplier(analysis, cvdState) {
  if (!analysis || typeof analysis !== "object") {
    return analysis;
  }
  const direction = analysis.direction;
  const stateKey = cvdState ?? "none";

  if (direction !== "bull" && direction !== "bear") {
    return {
      ...analysis,
      cvdState: stateKey,
      cvdMultiplier: 1.0,
    };
  }

  const directionKey = direction === "bull" ? "long" : "short";
  const mult = CVD_GATING.multipliers[directionKey]?.[stateKey] ?? 1.0;

  const baseScore = isFiniteNumber(analysis.score) ? analysis.score : 0;
  const newScore = baseScore * mult;
  const newConfidence = Math.min(Math.abs(newScore), 100);

  return {
    ...analysis,
    score: newScore,
    confidence: newConfidence,
    cvdState: stateKey,
    cvdMultiplier: mult,
  };
}
