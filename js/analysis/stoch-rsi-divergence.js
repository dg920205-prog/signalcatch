import { stochRsi } from "./indicators.js";
import { findSwingHighs, findSwingLows } from "./structure.js";
import { STOCHRSI_GATING } from "../config.js";

const EMPTY = Object.freeze({
  state: "none",
  current: null,
  previous: null,
  separated: false,
  separationReason: null,
});

const INSUFFICIENT = Object.freeze({
  ...EMPTY,
  state: "insufficient_data",
});

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function cloneResult(result) {
  return {
    state: result.state,
    current: result.current,
    previous: result.previous,
    separated: result.separated,
    separationReason: result.separationReason,
  };
}

function kToCandles(kSeries) {
  return kSeries.map((k) => ({
    open: k,
    high: k,
    low: k,
    close: k,
    volume: 1,
  }));
}

function findSeparation(kSeries, prevIndex, currentIndex, gating) {
  for (let index = prevIndex + 1; index < currentIndex; index += 1) {
    const k = kSeries[index];
    if (!isFiniteNumber(k)) continue;
    if (k > gating.obThreshold) return "obBreached";
    if (k < gating.osThreshold) return "osBreached";
  }
  return null;
}

function candidateResult(state, previous, current, valueKey) {
  return {
    state,
    current: { index: current.index, value: current.price },
    previous: { index: previous.index, value: previous.price },
    separated: false,
    separationReason: null,
    recencyIndex: current.index,
    valueKey,
  };
}

function toPublicResult(result) {
  return {
    state: result.state,
    current: result.current,
    previous: result.previous,
    separated: result.separated,
    separationReason: result.separationReason,
  };
}

export function detectStochRsiDivergence({
  candles,
  lookback = 2,
  gating = STOCHRSI_GATING,
} = {}) {
  if (
    !Array.isArray(candles) ||
    !Number.isInteger(lookback) ||
    lookback < 1 ||
    candles.length < gating.rsiPeriod + gating.stochPeriod + gating.kSmooth + gating.dSmooth
  ) {
    return cloneResult(INSUFFICIENT);
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
    return cloneResult(INSUFFICIENT);
  }

  const kSeries = result.kSeries.filter(isFiniteNumber);
  if (kSeries.length < lookback * 2 + 3) {
    return cloneResult(INSUFFICIENT);
  }

  const wrappedKCandles = kToCandles(kSeries);
  const lows = findSwingLows(wrappedKCandles, lookback);
  const highs = findSwingHighs(wrappedKCandles, lookback);

  if (lows.length < 2 && highs.length < 2) {
    return cloneResult(INSUFFICIENT);
  }

  let hlResult = null;
  let lhResult = null;
  let separationFallback = null;

  if (lows.length >= 2) {
    const previous = lows[lows.length - 2];
    const current = lows[lows.length - 1];
    const separationReason = findSeparation(kSeries, previous.index, current.index, gating);
    if (separationReason) {
      separationFallback ??= { ...EMPTY, separated: true, separationReason };
    } else if (current.price > previous.price) {
      hlResult = candidateResult("bullish_hl", previous, current, "low");
    }
  }

  if (highs.length >= 2) {
    const previous = highs[highs.length - 2];
    const current = highs[highs.length - 1];
    const separationReason = findSeparation(kSeries, previous.index, current.index, gating);
    if (separationReason) {
      separationFallback ??= { ...EMPTY, separated: true, separationReason };
    } else if (current.price < previous.price) {
      lhResult = candidateResult("bearish_lh", previous, current, "high");
    }
  }

  if (hlResult && lhResult) {
    return toPublicResult(
      hlResult.recencyIndex >= lhResult.recencyIndex ? hlResult : lhResult,
    );
  }
  if (hlResult) return toPublicResult(hlResult);
  if (lhResult) return toPublicResult(lhResult);
  if (separationFallback) return cloneResult(separationFallback);

  return cloneResult(EMPTY);
}
