import test from "node:test";
import assert from "node:assert/strict";

import { detectStochRsiDivergence } from "../js/analysis/stoch-rsi-divergence.js";

const TEST_GATING = Object.freeze({
  rsiPeriod: 5,
  stochPeriod: 5,
  kSmooth: 3,
  dSmooth: 1,
  obThreshold: 80,
  osThreshold: 20,
});

const HL_CLOSES = [
  99.87, 99.85, 99.69, 99.81, 99.92, 99.73, 99.58, 99.57, 99.58, 99.68,
  99.78, 99.59, 99.62, 99.76, 99.75, 99.72, 99.48, 99.4, 99.64, 99.6,
  99.8, 99.88, 100.01, 99.95, 99.82, 99.65, 99.49, 99.31, 99.1, 99.03,
  99.04, 98.96, 98.86, 98.9, 99.05, 99.03, 98.94, 99.1, 99.24, 99.42,
  99.51, 99.69, 99.8, 100.02, 99.91, 99.74, 99.94, 100.14, 100.34, 100.2,
  100.21, 100.4, 100.15, 99.91, 99.97, 99.94, 99.87, 99.92, 100, 100.13,
  100.11, 100.35, 100.17, 100.3, 100.11, 100.16, 100.28, 100.16, 100.29,
  100.28, 100.09, 100.3, 100.06, 100.13, 100.37, 100.15, 100.34, 100.09,
  100.3, 100.34,
];

const LH_CLOSES = [
  99.87, 99.67, 99.91, 99.66, 99.6, 99.53, 99.39, 99.58, 99.37, 99.17,
  99.36, 99.56, 99.52, 99.49, 99.27, 99.38, 99.17, 99.14, 98.93, 98.99,
  99.12, 99.17, 99.13, 99.33, 99.12, 98.99, 98.93, 98.93, 99.05, 99.15,
  99.21, 99.17, 98.94, 99.11, 99.14, 99.36, 99.27, 99.3, 99.09, 99.28,
  99.44, 99.23, 99.3, 99.46, 99.47, 99.3, 99.38, 99.19, 99.42, 99.53,
  99.71, 99.91, 99.84, 99.83, 99.67, 99.57, 99.38, 99.41, 99.55, 99.45,
  99.69, 99.88, 99.7, 99.88, 99.82, 99.67, 99.84, 100.02, 99.86, 99.7,
  99.87, 99.88, 99.87, 99.77, 99.95, 99.7, 99.52, 99.77, 100, 99.94,
];

const LOW_OB_CLOSES = [
  99.87, 99.94, 99.97, 100.13, 99.9, 99.96, 99.74, 99.64, 99.67, 99.82,
  99.88, 99.87, 99.88, 99.97, 100.18, 100.12, 100.03, 99.97, 100.01, 99.85,
  99.75, 99.89, 99.69, 99.7, 99.69, 99.46, 99.4, 99.49, 99.59, 99.64,
  99.73, 99.81, 99.67, 99.82, 99.86, 99.77, 99.54, 99.52, 99.55, 99.38,
  99.2, 99.28, 99.44, 99.21, 99.21, 99.04, 99.13, 99.08, 99.08, 99.29,
  99.5, 99.55, 99.35, 99.39, 99.24, 99.12, 99.01, 99.13, 99.01, 98.8,
  98.92, 98.71, 98.54, 98.32, 98.46, 98.66, 98.51, 98.62, 98.53, 98.68,
  98.67, 98.89, 99.01, 99.24, 99.25, 99.1, 99.25, 99.36, 99.57, 99.44,
];

const LOW_OS_OR_HIGH_OB_CLOSES = [
  99.87, 99.8, 99.8, 99.91, 99.68, 99.62, 99.75, 99.78, 99.54, 99.61,
  99.49, 99.45, 99.49, 99.66, 99.53, 99.77, 99.95, 99.86, 99.95, 99.97,
  99.83, 99.63, 99.42, 99.32, 99.14, 99.24, 99.28, 99.22, 99.11, 99.23,
  99.45, 99.29, 99.2, 99.44, 99.39, 99.41, 99.4, 99.64, 99.83, 99.94,
  100.16, 100.4, 100.23, 100.17, 100.26, 100.09, 100.09, 99.92, 99.97,
  100.16, 100.07, 99.83, 100.06, 99.92, 100.09, 99.85, 99.79, 99.57,
  99.49, 99.3, 99.46, 99.41, 99.24, 99.29, 99.44, 99.66, 99.41, 99.18,
  99.43, 99.58, 99.55, 99.5, 99.59, 99.82, 99.94, 99.93, 99.89, 99.71,
  99.91, 100.04,
];

const BOTH_CLOSES = [
  99.87, 99.76, 99.72, 99.91, 99.85, 99.75, 99.78, 99.97, 99.87, 99.86,
  99.99, 99.91, 100.08, 99.98, 100, 100.2, 100.33, 100.49, 100.36, 100.56,
  100.48, 100.28, 100.29, 100.35, 100.54, 100.72, 100.85, 101.06, 100.9,
  100.9, 101.02, 100.84, 100.67, 100.61, 100.41, 100.2, 100.39, 100.29,
  100.35, 100.3, 100.25, 100.22, 100, 99.85, 99.6, 99.42, 99.27, 99.47,
  99.29, 99.14, 99.13, 99.15, 99.18, 99.05, 98.9, 98.74, 98.63, 98.43,
  98.24, 98.38, 98.39, 98.28, 98.1, 98.14, 97.98, 98.23, 98.11, 98.05,
  98.17, 98.06, 97.83, 98.02, 98.24, 98.12, 97.97, 98.03, 97.93, 97.93,
  97.76, 97.63,
];

function candlesFromCloses(closes) {
  return closes.map((close) => ({
    open: close,
    high: close + 0.5,
    low: close - 0.5,
    close,
    volume: 100,
  }));
}

function detect(closes) {
  return detectStochRsiDivergence({
    candles: candlesFromCloses(closes),
    gating: TEST_GATING,
  });
}

test("detectStochRsiDivergence returns insufficient_data for short candles", () => {
  const result = detectStochRsiDivergence({
    candles: candlesFromCloses([100, 101, 102]),
    gating: TEST_GATING,
  });
  assert.equal(result.state, "insufficient_data");
});

test("detectStochRsiDivergence returns insufficient_data when flat K has no swings", () => {
  const result = detect(Array.from({ length: 40 }, () => 100));
  assert.equal(result.state, "insufficient_data");
});

test("detectStochRsiDivergence detects bullish_hl without threshold separation", () => {
  const result = detect(HL_CLOSES);
  assert.equal(result.state, "bullish_hl");
  assert.equal(result.separated, false);
});

test("bullish_hl has current value greater than previous value", () => {
  const result = detect(HL_CLOSES);
  assert.ok(result.current.value > result.previous.value);
});

test("bullish_hl preserves chronological swing order", () => {
  const result = detect(HL_CLOSES);
  assert.ok(result.current.index > result.previous.index);
});

test("detectStochRsiDivergence detects bearish_lh without threshold separation", () => {
  const result = detect(LH_CLOSES);
  assert.equal(result.state, "bearish_lh");
  assert.equal(result.separated, false);
});

test("bearish_lh has current value lower than previous value", () => {
  const result = detect(LH_CLOSES);
  assert.ok(result.current.value < result.previous.value);
});

test("swing low separation above 80 returns none with obBreached", () => {
  const result = detect(LOW_OB_CLOSES);
  assert.equal(result.state, "none");
  assert.equal(result.separated, true);
  assert.equal(result.separationReason, "obBreached");
});

test("swing low separation below 20 returns none with osBreached", () => {
  const result = detect(LOW_OS_OR_HIGH_OB_CLOSES);
  assert.equal(result.state, "none");
  assert.equal(result.separated, true);
  assert.equal(result.separationReason, "osBreached");
});

test("swing high separation above 80 returns none with separation flag", () => {
  const result = detect(LOW_OS_OR_HIGH_OB_CLOSES);
  assert.equal(result.state, "none");
  assert.equal(result.separated, true);
});

test("when bullish_hl and bearish_lh both exist the most recent swing wins", () => {
  const result = detect(BOTH_CLOSES);
  assert.equal(result.state, "bearish_lh");
  assert.equal(result.current.index, 62);
});
