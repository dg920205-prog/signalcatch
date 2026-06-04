import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTrendState, applyTrendMultiplier, TREND_STATES } from "../js/analysis/trend-gating.js";

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
