import { STRUCTURE_GATING } from "../config.js";

export const STRUCTURE_STATES = Object.freeze({
  BULLISH: "bullish_structure",
  BEARISH: "bearish_structure",
  MIXED: "mixed",
  UNKNOWN: "unknown",
});

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidCandle(candle) {
  return (
    candle &&
    isFiniteNumber(candle.high) &&
    isFiniteNumber(candle.low) &&
    candle.high > 0 &&
    candle.low > 0 &&
    candle.low <= candle.high
  );
}

export function findSwingHighs(candles, lookback = 2) {
  if (!Array.isArray(candles) || !Number.isInteger(lookback) || lookback < 1) {
    return [];
  }
  const swings = [];
  for (let i = lookback; i < candles.length - lookback; i += 1) {
    if (!isValidCandle(candles[i])) continue;
    const high = candles[i].high;
    let isSwing = true;
    for (let j = 1; j <= lookback; j += 1) {
      const prev = candles[i - j];
      const next = candles[i + j];
      if (!isValidCandle(prev) || !isValidCandle(next)) {
        isSwing = false;
        break;
      }
      if (prev.high >= high || next.high >= high) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) swings.push({ index: i, price: high });
  }
  return swings;
}

export function findSwingLows(candles, lookback = 2) {
  if (!Array.isArray(candles) || !Number.isInteger(lookback) || lookback < 1) {
    return [];
  }
  const swings = [];
  for (let i = lookback; i < candles.length - lookback; i += 1) {
    if (!isValidCandle(candles[i])) continue;
    const low = candles[i].low;
    let isSwing = true;
    for (let j = 1; j <= lookback; j += 1) {
      const prev = candles[i - j];
      const next = candles[i + j];
      if (!isValidCandle(prev) || !isValidCandle(next)) {
        isSwing = false;
        break;
      }
      if (prev.low <= low || next.low <= low) {
        isSwing = false;
        break;
      }
    }
    if (isSwing) swings.push({ index: i, price: low });
  }
  return swings;
}

export function computeStructureState({
  candles,
  swingLookback = STRUCTURE_GATING.swingLookback,
} = {}) {
  if (!Array.isArray(candles)) {
    return { state: STRUCTURE_STATES.UNKNOWN, details: { reason: "no_candles" } };
  }
  const lookback = Number.isInteger(swingLookback) && swingLookback >= 1 ? swingLookback : 2;
  if (candles.length < lookback * 2 + 1) {
    return { state: STRUCTURE_STATES.UNKNOWN, details: { reason: "insufficient_candles" } };
  }

  const highs = findSwingHighs(candles, lookback);
  const lows = findSwingLows(candles, lookback);

  if (highs.length < 2 || lows.length < 2) {
    return { state: STRUCTURE_STATES.UNKNOWN, details: { reason: "insufficient_swings" } };
  }

  const lastHigh = highs[highs.length - 1];
  const prevHigh = highs[highs.length - 2];
  const lastLow = lows[lows.length - 1];
  const prevLow = lows[lows.length - 2];

  const hh = lastHigh.price > prevHigh.price;
  const hl = lastLow.price > prevLow.price;
  const lh = lastHigh.price < prevHigh.price;
  const ll = lastLow.price < prevLow.price;

  let state;
  if (hh && hl) state = STRUCTURE_STATES.BULLISH;
  else if (lh && ll) state = STRUCTURE_STATES.BEARISH;
  else state = STRUCTURE_STATES.MIXED;

  return {
    state,
    details: { lastHigh, prevHigh, lastLow, prevLow },
  };
}
