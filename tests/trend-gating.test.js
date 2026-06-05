import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTrendState, applyTrendMultiplier, applyStructureMultiplier, applyCvdMultiplier, TREND_STATES } from "../js/analysis/trend-gating.js";

function trendCandles(count, mode) {
  const candles = [];
  let price = 1000;
  for (let i = 0; i < count; i += 1) {
    let move;
    if (mode === "strong_up") move = 0.5;
    else if (mode === "strong_down") move = -0.5;
    else if (mode === "ranging") move = i % 2 === 0 ? 0.2 : -0.2;
    else move = 0;
    const open = price;
    const close = price + move;
    const high = Math.max(open, close) + 0.2;
    const low = Math.min(open, close) - 0.2;
    candles.push({ open, high, low, close, volume: 1000 });
    price = close;
  }
  return candles;
}

test("computeTrendState returns insufficient_data for short candles", () => {
  const result = computeTrendState({ candles: trendCandles(50) });
  assert.equal(result.state, TREND_STATES.INSUFFICIENT_DATA);
});

test("computeTrendState returns insufficient_data for null candles", () => {
  const result = computeTrendState({ candles: null });
  assert.equal(result.state, TREND_STATES.INSUFFICIENT_DATA);
});

test("computeTrendState detects strong bull", () => {
  const result = computeTrendState({
    candles: trendCandles(250, "strong_up"),
    longEmaPeriod: 200,
    shortEmaPeriod: 50,
  });
  assert.equal(result.state, TREND_STATES.STRONG_BULL);
});

test("computeTrendState detects strong bear", () => {
  const result = computeTrendState({
    candles: trendCandles(250, "strong_down"),
    longEmaPeriod: 200,
    shortEmaPeriod: 50,
  });
  assert.equal(result.state, TREND_STATES.STRONG_BEAR);
});

test("computeTrendState detects neutral for ranging market", () => {
  const result = computeTrendState({
    candles: trendCandles(250, "ranging"),
    longEmaPeriod: 200,
    shortEmaPeriod: 50,
  });
  assert.equal(result.state, TREND_STATES.NEUTRAL);
});

test("applyTrendMultiplier reduces score for long signal in strong bear", () => {
  const analysis = { direction: "bull", score: 60, confidence: 60 };
  const result = applyTrendMultiplier(analysis, TREND_STATES.STRONG_BEAR);
  assert.ok(result.score < analysis.score);
  assert.equal(result.trendState, TREND_STATES.STRONG_BEAR);
});

test("applyTrendMultiplier boosts score for long signal in strong bull", () => {
  const analysis = { direction: "bull", score: 60, confidence: 60 };
  const result = applyTrendMultiplier(analysis, TREND_STATES.STRONG_BULL);
  assert.ok(result.score > analysis.score);
});

test("applyTrendMultiplier applies BTC overlay penalty for alt long in BTC bear", () => {
  const analysis = { direction: "bull", score: 60, confidence: 60 };
  const btcContext = { isBtc: false, state: TREND_STATES.STRONG_BEAR };
  const withOverlay = applyTrendMultiplier(analysis, TREND_STATES.NEUTRAL, btcContext);
  const withoutOverlay = applyTrendMultiplier(analysis, TREND_STATES.NEUTRAL, null);
  assert.ok(withOverlay.score < withoutOverlay.score);
  assert.equal(withOverlay.btcOverlayApplied, true);
});

test("applyTrendMultiplier does not apply BTC overlay for BTC itself", () => {
  const analysis = { direction: "bull", score: 60, confidence: 60 };
  const btcContext = { isBtc: true, state: TREND_STATES.STRONG_BEAR };
  const result = applyTrendMultiplier(analysis, TREND_STATES.NEUTRAL, btcContext);
  assert.equal(result.btcOverlayApplied, false);
});

test("applyTrendMultiplier returns unchanged multiplier for neutral direction", () => {
  const analysis = { direction: "neutral", score: 0, confidence: 0 };
  const result = applyTrendMultiplier(analysis, TREND_STATES.STRONG_BULL);
  assert.equal(result.trendMultiplier, 1.0);
});

test("applyStructureMultiplier boosts long signal in bullish structure", () => {
  const analysis = { direction: "bull", score: 60, confidence: 60 };
  const result = applyStructureMultiplier(analysis, "bullish_structure");
  assert.ok(result.score > analysis.score);
  assert.equal(result.structureMultiplier, 1.05);
  assert.equal(result.structureState, "bullish_structure");
});

test("applyStructureMultiplier reduces long signal in bearish structure", () => {
  const analysis = { direction: "bull", score: 60, confidence: 60 };
  const result = applyStructureMultiplier(analysis, "bearish_structure");
  assert.ok(result.score < analysis.score);
  assert.equal(result.structureMultiplier, 0.95);
});

test("applyStructureMultiplier reverses for short direction", () => {
  const analysis = { direction: "bear", score: -60, confidence: 60 };
  const inBullish = applyStructureMultiplier(analysis, "bullish_structure");
  const inBearish = applyStructureMultiplier(analysis, "bearish_structure");
  assert.equal(inBullish.structureMultiplier, 0.95);
  assert.equal(inBearish.structureMultiplier, 1.05);
});

test("applyStructureMultiplier returns 1.0 multiplier for mixed/unknown", () => {
  const analysis = { direction: "bull", score: 60, confidence: 60 };
  assert.equal(applyStructureMultiplier(analysis, "mixed").structureMultiplier, 1.0);
  assert.equal(applyStructureMultiplier(analysis, "unknown").structureMultiplier, 1.0);
  assert.equal(applyStructureMultiplier(analysis, undefined).structureMultiplier, 1.0);
});

test("applyStructureMultiplier compounds with prior trend multiplication", () => {
  const baseAnalysis = { direction: "bull", score: 50, confidence: 50 };
  const afterTrend = applyTrendMultiplier(baseAnalysis, TREND_STATES.STRONG_BULL);
  const afterStructure = applyStructureMultiplier(afterTrend, "bullish_structure");
  assert.ok(Math.abs(afterStructure.score - 63.0) < 0.01);
  assert.equal(afterStructure.trendMultiplier, 1.2);
  assert.equal(afterStructure.structureMultiplier, 1.05);
});

test("applyCvdMultiplier boosts long signal in bullish_divergence", () => {
  const analysis = { direction: "bull", score: 60, confidence: 60 };
  const result = applyCvdMultiplier(analysis, "bullish_divergence");
  assert.ok(result.score > analysis.score);
  assert.equal(result.cvdMultiplier, 1.05);
  assert.equal(result.cvdState, "bullish_divergence");
});

test("applyCvdMultiplier reduces long signal in bearish_divergence", () => {
  const analysis = { direction: "bull", score: 60, confidence: 60 };
  const result = applyCvdMultiplier(analysis, "bearish_divergence");
  assert.ok(result.score < analysis.score);
  assert.equal(result.cvdMultiplier, 0.95);
});

test("applyCvdMultiplier returns 1.0 multiplier for none/insufficient_data", () => {
  const analysis = { direction: "bull", score: 60, confidence: 60 };
  assert.equal(applyCvdMultiplier(analysis, "none").cvdMultiplier, 1.0);
  assert.equal(applyCvdMultiplier(analysis, "insufficient_data").cvdMultiplier, 1.0);
  assert.equal(applyCvdMultiplier(analysis, undefined).cvdMultiplier, 1.0);
});

test("applyCvdMultiplier compounds with trend x structure multiplication", () => {
  const baseAnalysis = { direction: "bull", score: 50, confidence: 50 };
  const afterTrend = applyTrendMultiplier(baseAnalysis, TREND_STATES.STRONG_BULL);
  const afterStructure = applyStructureMultiplier(afterTrend, "bullish_structure");
  const afterCvd = applyCvdMultiplier(afterStructure, "bullish_divergence");
  assert.ok(Math.abs(afterCvd.score - 66.15) < 0.01);
  assert.equal(afterCvd.trendMultiplier, 1.2);
  assert.equal(afterCvd.structureMultiplier, 1.05);
  assert.equal(afterCvd.cvdMultiplier, 1.05);
});
