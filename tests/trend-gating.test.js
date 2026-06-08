import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTrendState, applyTrendMultiplier, applyStructureMultiplier, applyCvdMultiplier, computeExtensionState, applyExtensionMultiplier, TREND_STATES } from "../js/analysis/trend-gating.js";

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

test("computeExtensionState returns insufficient_data for short input", () => {
  const result = computeExtensionState({ candles: [], longEmaPeriod: 200, shortEmaPeriod: 50 });
  assert.equal(result.state, "insufficient_data");
});

test("computeExtensionState detects overextended_up when both ratios exceed thresholds", () => {
  const candles = [];
  for (let i = 0; i < 200; i += 1) {
    candles.push({ open: 1, high: 1.01, low: 0.99, close: 1, volume: 100 });
  }
  for (let i = 0; i < 30; i += 1) {
    const p = 1 + i * 0.02;
    candles.push({ open: p, high: p + 0.01, low: p - 0.01, close: p, volume: 100 });
  }
  const result = computeExtensionState({ candles, longEmaPeriod: 200, shortEmaPeriod: 50 });
  assert.equal(result.state, "overextended_up", `expected overextended_up, got ${result.state}`);
});

test("computeExtensionState returns normal when within range", () => {
  const candles = [];
  for (let i = 0; i < 230; i += 1) {
    candles.push({ open: 1, high: 1.01, low: 0.99, close: 1, volume: 100 });
  }
  const result = computeExtensionState({ candles, longEmaPeriod: 200, shortEmaPeriod: 50 });
  assert.equal(result.state, "normal");
});

test("applyExtensionMultiplier penalizes bull when overextended_up", () => {
  const analysis = { direction: "bull", score: 80, scoreBreakdown: {} };
  const out = applyExtensionMultiplier(analysis, { state: "overextended_up" });
  assert.equal(out.score, 40);
  assert.equal(out.scoreBreakdown.extensionMultiplier, 0.5);
});

test("applyExtensionMultiplier does not penalize bear when overextended_up", () => {
  const analysis = { direction: "bear", score: 80, scoreBreakdown: {} };
  const out = applyExtensionMultiplier(analysis, { state: "overextended_up" });
  assert.equal(out.score, 80);
});

test("applyExtensionMultiplier no-op when normal", () => {
  const analysis = { direction: "bull", score: 80, scoreBreakdown: {} };
  const out = applyExtensionMultiplier(analysis, { state: "normal" });
  assert.equal(out.score, 80);
});
