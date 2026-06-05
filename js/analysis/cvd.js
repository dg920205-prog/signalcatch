import { findSwingHighs, findSwingLows } from "./structure.js";
import { CVD_GATING } from "../config.js";

export const CVD_STATES = Object.freeze({
  BULLISH_DIVERGENCE: "bullish_divergence",
  BEARISH_DIVERGENCE: "bearish_divergence",
  NONE: "none",
  INSUFFICIENT_DATA: "insufficient_data",
});

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidCandle(candle) {
  return (
    candle &&
    isFiniteNumber(candle.open) &&
    isFiniteNumber(candle.high) &&
    isFiniteNumber(candle.low) &&
    isFiniteNumber(candle.close) &&
    isFiniteNumber(candle.volume) &&
    candle.high > 0 &&
    candle.low > 0 &&
    candle.volume >= 0 &&
    candle.low <= candle.high
  );
}

export function proxyDelta(candle) {
  if (!isValidCandle(candle)) return null;
  const range = candle.high - candle.low;
  if (range <= 0) return 0;
  const body = Math.abs(candle.close - candle.open);
  const sign = Math.sign(candle.close - candle.open);
  return ((candle.volume * body) / range) * sign;
}

export function cumulativeCvd(candles) {
  if (!Array.isArray(candles)) return [];
  const result = [];
  let acc = 0;
  for (const candle of candles) {
    const delta = proxyDelta(candle);
    if (delta === null) return [];
    acc += delta;
    result.push(acc);
  }
  return result;
}

export function detectCvdDivergence({ candles, cvdValues, swingLookback = 2 } = {}) {
  if (
    !Array.isArray(candles) ||
    !Array.isArray(cvdValues) ||
    candles.length !== cvdValues.length ||
    candles.length < swingLookback * 2 + 1
  ) {
    return { state: CVD_STATES.NONE };
  }

  const highs = findSwingHighs(candles, swingLookback);
  const lows = findSwingLows(candles, swingLookback);

  if (highs.length >= 2) {
    const last = highs[highs.length - 1];
    const prev = highs[highs.length - 2];
    if (last.price > prev.price && cvdValues[last.index] < cvdValues[prev.index]) {
      return {
        state: CVD_STATES.BEARISH_DIVERGENCE,
        details: { lastHigh: last, prevHigh: prev, lastCvd: cvdValues[last.index], prevCvd: cvdValues[prev.index] },
      };
    }
  }

  if (lows.length >= 2) {
    const last = lows[lows.length - 1];
    const prev = lows[lows.length - 2];
    if (last.price < prev.price && cvdValues[last.index] > cvdValues[prev.index]) {
      return {
        state: CVD_STATES.BULLISH_DIVERGENCE,
        details: { lastLow: last, prevLow: prev, lastCvd: cvdValues[last.index], prevCvd: cvdValues[prev.index] },
      };
    }
  }

  return { state: CVD_STATES.NONE };
}

export function computeCvdState({ candles, swingLookback = CVD_GATING.swingLookback } = {}) {
  if (!Array.isArray(candles)) {
    return { state: CVD_STATES.INSUFFICIENT_DATA, details: { reason: "no_candles" } };
  }
  const lookback = Number.isInteger(swingLookback) && swingLookback >= 1 ? swingLookback : 2;
  if (candles.length < lookback * 2 + 1) {
    return { state: CVD_STATES.INSUFFICIENT_DATA, details: { reason: "insufficient_candles" } };
  }
  const cvdValues = cumulativeCvd(candles);
  if (cvdValues.length === 0) {
    return { state: CVD_STATES.INSUFFICIENT_DATA, details: { reason: "invalid_candles" } };
  }
  return detectCvdDivergence({ candles, cvdValues, swingLookback: lookback });
}
