import { findSwingHighs, findSwingLows } from "./structure.js";
import { atr } from "./indicators.js";
import { ICT_ZONES } from "../config.js";

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
    candle.high > 0 &&
    candle.low > 0 &&
    candle.low <= candle.high &&
    candle.open >= candle.low &&
    candle.open <= candle.high &&
    candle.close >= candle.low &&
    candle.close <= candle.high
  );
}

export function detectFvgs(candles, { atrValue, atrMultiplier = ICT_ZONES.fvgAtrMultiplier } = {}) {
  if (!Array.isArray(candles) || candles.length < 3) return [];
  const atrUsed = isFiniteNumber(atrValue) && atrValue > 0 ? atrValue : atr(candles, 14);
  if (!isFiniteNumber(atrUsed) || atrUsed <= 0) return [];

  const fvgs = [];
  for (let i = 2; i < candles.length; i += 1) {
    const c0 = candles[i - 2];
    const c1 = candles[i - 1];
    const c2 = candles[i];
    if (![c0, c1, c2].every(isValidCandle)) continue;

    const body = Math.abs(c1.close - c1.open);
    if (body < atrMultiplier * atrUsed) continue;

    if (c2.low > c0.high) {
      const bottom = c0.high;
      const top = c2.low;
      fvgs.push({ type: "bullish", index: i, top, bottom, ce: (top + bottom) / 2 });
    } else if (c2.high < c0.low) {
      const top = c0.low;
      const bottom = c2.high;
      fvgs.push({ type: "bearish", index: i, top, bottom, ce: (top + bottom) / 2 });
    }
  }
  return fvgs;
}

export function detectOrderBlocks(candles, opts = {}) {
  if (!Array.isArray(candles)) return [];
  const fvgs = detectFvgs(candles, opts);
  const scanWindow = Number.isInteger(ICT_ZONES.obScanWindow) ? ICT_ZONES.obScanWindow : 5;
  const obs = [];

  for (const fvg of fvgs) {
    const displacementStart = fvg.index - 2;
    const wantBearishCandle = fvg.type === "bullish";
    for (let k = displacementStart; k >= Math.max(0, displacementStart - scanWindow); k -= 1) {
      const c = candles[k];
      if (!isValidCandle(c)) continue;
      const isBearishCandle = c.close < c.open;
      const isBullishCandle = c.close > c.open;
      if ((wantBearishCandle && isBearishCandle) || (!wantBearishCandle && isBullishCandle)) {
        obs.push({
          type: fvg.type,
          index: k,
          top: c.high,
          bottom: c.low,
          ce: (c.high + c.low) / 2,
          fvgIndex: fvg.index,
        });
        break;
      }
    }
  }
  return obs;
}

export function detectSweeps(candles, { swingLookback = ICT_ZONES.swingLookback } = {}) {
  if (!Array.isArray(candles)) return [];
  const lookback = Number.isInteger(swingLookback) && swingLookback >= 1 ? swingLookback : 2;
  if (candles.length < lookback * 2 + 2) return [];

  const swingHighs = findSwingHighs(candles, lookback);
  const swingLows = findSwingLows(candles, lookback);
  const sweeps = [];

  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i];
    if (!isValidCandle(c)) continue;

    for (const sl of swingLows) {
      if (sl.index + lookback >= i) continue;
      if (c.low < sl.price && c.close > sl.price) {
        sweeps.push({ type: "bullish", index: i, sweptLevel: sl.price, sweptIndex: sl.index });
        break;
      }
    }
    for (const sh of swingHighs) {
      if (sh.index + lookback >= i) continue;
      if (c.high > sh.price && c.close < sh.price) {
        sweeps.push({ type: "bearish", index: i, sweptLevel: sh.price, sweptIndex: sh.index });
        break;
      }
    }
  }
  return sweeps;
}
