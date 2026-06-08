import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStochRsiState, applyStochRsiMultiplier } from "../js/analysis/stoch-rsi-gating.js";

const TEST_GATING = Object.freeze({
  rsiPeriod: 3,
  stochPeriod: 3,
  kSmooth: 1,
  dSmooth: 1,
  obThreshold: 80,
  osThreshold: 20,
  embeddedWindow: 5,
  embeddedMinCount: 4,
  embeddedPenalty: 0.3,
  exitMultiplier: 0.9,
});

function candlesFromCloses(closes) {
  return closes.map((close) => ({
    open: close,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 100,
  }));
}

function stateFor(closes) {
  return computeStochRsiState({ candles: candlesFromCloses(closes), gating: TEST_GATING });
}

test("computeStochRsiState returns insufficient_data for short input", () => {
  assert.equal(computeStochRsiState({ candles: [], gating: TEST_GATING }).state, "insufficient_data");
});

test("computeStochRsiState detects embedded_ob when 4 of 5 K values exceed 80", () => {
  const result = stateFor([100, 102, 101, 104, 103, 106, 105, 108, 107, 110, 111, 112]);
  assert.equal(result.state, "embedded_ob");
  assert.equal(result.recentKs.filter((value) => value > TEST_GATING.obThreshold).length, 4);
});

test("computeStochRsiState detects embedded_os when 4 of 5 K values are below 20", () => {
  const result = stateFor([100, 98, 99, 96, 97, 94, 95, 92, 93, 90, 89, 88]);
  assert.equal(result.state, "embedded_os");
  assert.equal(result.recentKs.filter((value) => value < TEST_GATING.osThreshold).length, 4);
});

test("computeStochRsiState detects embedded_ob_exit before embedded_ob", () => {
  const result = stateFor([100, 102, 101, 104, 103, 106, 105, 108, 107, 110, 111, 112, 100]);
  assert.equal(result.state, "embedded_ob_exit");
  assert.ok(result.recentKs.at(-2) > TEST_GATING.obThreshold);
  assert.ok(result.recentKs.at(-1) <= TEST_GATING.obThreshold);
});

test("computeStochRsiState detects embedded_os_exit before embedded_os", () => {
  const result = stateFor([100, 98, 99, 96, 97, 94, 95, 92, 93, 90, 89, 88, 95]);
  assert.equal(result.state, "embedded_os_exit");
  assert.ok(result.recentKs.at(-2) < TEST_GATING.osThreshold);
  assert.ok(result.recentKs.at(-1) >= TEST_GATING.osThreshold);
});

test("computeStochRsiState returns normal for flat neutral K values", () => {
  const result = stateFor(Array.from({ length: 12 }, () => 100));
  assert.equal(result.state, "normal");
  assert.ok(result.recentKs.every((value) => value === 50));
});

test("computeStochRsiState returns normal when only 3 of 5 K values exceed 80", () => {
  const result = stateFor([100, 102, 101, 104, 103, 106, 105, 108, 107, 110, 111, 112, 110, 105]);
  assert.equal(result.state, "normal");
  assert.equal(result.recentKs.filter((value) => value > TEST_GATING.obThreshold).length, 3);
});

test("computeStochRsiState chooses EXIT over simultaneous embedded count", () => {
  const result = stateFor([100, 102, 101, 104, 103, 106, 105, 108, 107, 110, 111, 112, 112, 100]);
  assert.equal(result.state, "embedded_ob_exit");
  assert.equal(result.recentKs.filter((value) => value > TEST_GATING.obThreshold).length, 4);
});

test("applyStochRsiMultiplier penalizes bear during embedded_ob", () => {
  const result = applyStochRsiMultiplier({ direction: "bear", score: 80, scoreBreakdown: {} }, { state: "embedded_ob" }, TEST_GATING);
  assert.equal(result.score, 24);
  assert.equal(result.scoreBreakdown.stochRsiMultiplier, 0.3);
});

test("applyStochRsiMultiplier penalizes bull during embedded_os", () => {
  const result = applyStochRsiMultiplier({ direction: "bull", score: 80, scoreBreakdown: {} }, { state: "embedded_os" }, TEST_GATING);
  assert.equal(result.score, 24);
  assert.equal(result.scoreBreakdown.stochRsiMultiplier, 0.3);
});

test("applyStochRsiMultiplier applies exit multiplier to bear after embedded_ob_exit", () => {
  const result = applyStochRsiMultiplier({ direction: "bear", score: 80, scoreBreakdown: {} }, { state: "embedded_ob_exit" }, TEST_GATING);
  assert.equal(result.score, 72);
  assert.equal(result.scoreBreakdown.stochRsiMultiplier, 0.9);
});

test("applyStochRsiMultiplier applies exit multiplier to bull after embedded_os_exit", () => {
  const result = applyStochRsiMultiplier({ direction: "bull", score: 80, scoreBreakdown: {} }, { state: "embedded_os_exit" }, TEST_GATING);
  assert.equal(result.score, 72);
  assert.equal(result.scoreBreakdown.stochRsiMultiplier, 0.9);
});

test("applyStochRsiMultiplier keeps same-direction embedded signals at 1.0", () => {
  const result = applyStochRsiMultiplier({ direction: "bull", score: 80, scoreBreakdown: {} }, { state: "embedded_ob" }, TEST_GATING);
  assert.equal(result.score, 80);
  assert.equal(result.scoreBreakdown.stochRsiMultiplier, 1.0);
});

test("applyStochRsiMultiplier keeps normal and insufficient states at 1.0", () => {
  const normal = applyStochRsiMultiplier({ direction: "bull", score: 80, scoreBreakdown: {} }, { state: "normal" }, TEST_GATING);
  const insufficient = applyStochRsiMultiplier({ direction: "bear", score: 80, scoreBreakdown: {} }, { state: "insufficient_data" }, TEST_GATING);
  assert.equal(normal.scoreBreakdown.stochRsiMultiplier, 1.0);
  assert.equal(insufficient.scoreBreakdown.stochRsiMultiplier, 1.0);
});
