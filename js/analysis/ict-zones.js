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

function rangesOverlap(aLow, aHigh, bLow, bHigh) {
  return aLow <= bHigh && bLow <= aHigh;
}

function isMitigated(candles, activationIndex, bottom, top) {
  for (let i = activationIndex + 1; i < candles.length; i += 1) {
    const cc = candles[i];
    if (!isValidCandle(cc)) continue;
    if (rangesOverlap(cc.low, cc.high, bottom, top)) {
      return true;
    }
  }
  return false;
}

export function buildIctZones({ candles, atrValue, trendBias = null } = {}) {
  if (!Array.isArray(candles) || candles.length < 3) return [];

  const fvgs = detectFvgs(candles, { atrValue });
  const obs = detectOrderBlocks(candles, { atrValue });
  const sweeps = detectSweeps(candles, {});

  const sweepWindow = Number.isInteger(ICT_ZONES.sweepWindow) ? ICT_ZONES.sweepWindow : 10;
  const minConfidence = Number.isInteger(ICT_ZONES.minConfidence) ? ICT_ZONES.minConfidence : 3;

  const zones = [];

  function hasPrecedingSweep(type, formationIndex) {
    return sweeps.some(
      (s) =>
        s.type === type &&
        s.index < formationIndex &&
        s.index >= formationIndex - sweepWindow,
    );
  }

  function scoreZone({ type, sweep, confluence, aligned }) {
    let score = 1;
    if (sweep) score += 2;
    if (confluence) score += 1;
    if (aligned) score += 1;
    return score;
  }

  for (const ob of obs) {
    const activationIndex = Number.isInteger(ob.fvgIndex) ? ob.fvgIndex : ob.index;
    const confluence = fvgs.some(
      (f) => f.type === ob.type && rangesOverlap(ob.bottom, ob.top, f.bottom, f.top),
    );
    const sweep = hasPrecedingSweep(ob.type, activationIndex);
    const aligned =
      (trendBias === "bull" && ob.type === "bullish") ||
      (trendBias === "bear" && ob.type === "bearish");
    const confidence = scoreZone({ type: ob.type, sweep, confluence, aligned });
    zones.push({
      kind: confluence ? "bpr" : "ob",
      type: ob.type,
      top: ob.top,
      bottom: ob.bottom,
      ce: ob.ce,
      index: ob.index,
      activationIndex,
      hasSweep: sweep,
      hasConfluence: confluence,
      trendAligned: aligned,
      confidence,
      mitigated: isMitigated(candles, activationIndex, ob.bottom, ob.top),
    });
  }

  for (const f of fvgs) {
    const overlapsOb = obs.some(
      (ob) => ob.type === f.type && rangesOverlap(f.bottom, f.top, ob.bottom, ob.top),
    );
    if (overlapsOb) continue;
    const sweep = hasPrecedingSweep(f.type, f.index);
    const aligned =
      (trendBias === "bull" && f.type === "bullish") ||
      (trendBias === "bear" && f.type === "bearish");
    const confidence = scoreZone({ type: f.type, sweep, confluence: false, aligned });
    zones.push({
      kind: "fvg",
      type: f.type,
      top: f.top,
      bottom: f.bottom,
      ce: f.ce,
      index: f.index,
      activationIndex: f.index,
      hasSweep: sweep,
      hasConfluence: false,
      trendAligned: aligned,
      confidence,
      mitigated: isMitigated(candles, f.index, f.bottom, f.top),
    });
  }

  return zones;
}

export function selectEntryZone({
  zones,
  direction,
  referencePrice,
  minConfidence = ICT_ZONES.minConfidence ?? 3,
} = {}) {
  if (!Array.isArray(zones) || zones.length === 0) return null;
  if (direction !== "bull" && direction !== "bear") return null;

  const wantType = direction === "bull" ? "bullish" : "bearish";
  const refOk = isFiniteNumber(referencePrice);

  const candidates = zones.filter((z) => {
    if (z.type !== wantType) return false;
    if (z.mitigated) return false;
    if (z.confidence < minConfidence) return false;
    if (refOk) {
      if (direction === "bull" && z.top > referencePrice) return false;
      if (direction === "bear" && z.bottom < referencePrice) return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (refOk) {
      const da = Math.min(Math.abs(referencePrice - a.top), Math.abs(referencePrice - a.bottom));
      const db = Math.min(Math.abs(referencePrice - b.top), Math.abs(referencePrice - b.bottom));
      return da - db;
    }
    return b.index - a.index;
  });

  return candidates[0];
}
