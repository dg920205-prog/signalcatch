import { test } from "node:test";
import assert from "node:assert/strict";
import {
  proxyDelta,
  cumulativeCvd,
  detectCvdDivergence,
  computeCvdState,
  CVD_STATES,
} from "../js/analysis/cvd.js";

function makeCandle(open, close, high, low, volume) {
  return { open, close, high, low, volume };
}

test("proxyDelta returns null for invalid candle", () => {
  assert.equal(proxyDelta(null), null);
  assert.equal(proxyDelta(undefined), null);
  assert.equal(proxyDelta({}), null);
  assert.equal(proxyDelta(makeCandle(1, 2, NaN, 0.5, 100)), null);
});

test("proxyDelta returns 0 for zero-range candle", () => {
  assert.equal(proxyDelta(makeCandle(100, 100, 100, 100, 1000)), 0);
});

test("proxyDelta sign matches close-open direction", () => {
  const up = proxyDelta(makeCandle(100, 102, 102.5, 99.5, 1000));
  const down = proxyDelta(makeCandle(100, 98, 100.5, 97.5, 1000));
  assert.ok(up > 0, "up candle should have positive delta");
  assert.ok(down < 0, "down candle should have negative delta");
});

test("proxyDelta magnitude scales with body ratio and volume", () => {
  const full = proxyDelta(makeCandle(100, 105, 105, 100, 1000));
  const half = proxyDelta(makeCandle(100, 105, 110, 100, 1000));
  assert.ok(Math.abs(full) > Math.abs(half), "full body should have larger delta than half body");
});

test("cumulativeCvd builds correct cumulative sum", () => {
  const candles = [
    makeCandle(100, 102, 102.5, 99.5, 1000),
    makeCandle(102, 104, 104.5, 101.5, 1000),
    makeCandle(104, 102, 104.5, 101.5, 1000),
  ];
  const cvd = cumulativeCvd(candles);
  assert.equal(cvd.length, 3);
  assert.ok(cvd[0] > 0);
  assert.ok(cvd[1] > cvd[0]);
  assert.ok(cvd[2] < cvd[1]);
});

test("cumulativeCvd returns empty for invalid candle in series", () => {
  const candles = [
    makeCandle(100, 102, 102.5, 99.5, 1000),
    { not: "a candle" },
  ];
  assert.deepEqual(cumulativeCvd(candles), []);
});

test("cumulativeCvd returns empty for non-array", () => {
  assert.deepEqual(cumulativeCvd(null), []);
  assert.deepEqual(cumulativeCvd("string"), []);
});

test("detectCvdDivergence returns none for short data", () => {
  assert.equal(detectCvdDivergence({ candles: [], cvdValues: [] }).state, CVD_STATES.NONE);
  assert.equal(
    detectCvdDivergence({ candles: [makeCandle(1, 1, 2, 0.5, 100)], cvdValues: [0] }).state,
    CVD_STATES.NONE,
  );
});

test("detectCvdDivergence detects bullish divergence (price LL, CVD HL)", () => {
  const candles = [
    makeCandle(100, 100.5, 101, 99.5, 500),
    makeCandle(100.5, 100, 101, 99.5, 500),
    makeCandle(100, 100.5, 101, 99.5, 500),
    makeCandle(100.5, 95, 100.5, 94.9, 3000),
    makeCandle(95, 88, 95, 87.9, 3000),
    makeCandle(88, 80, 88, 79.9, 3000),
    makeCandle(80, 70, 80, 69.9, 3000),
    makeCandle(70, 60, 70, 59.9, 3000),
    makeCandle(60, 65, 66, 60.01, 1000),
    makeCandle(65, 72, 73, 65.01, 1000),
    makeCandle(72, 80, 81, 72.01, 1000),
    makeCandle(80, 88, 89, 80.01, 1000),
    makeCandle(88, 90, 91, 88.01, 1000),
    makeCandle(90, 85, 90, 84.9, 400),
    makeCandle(85, 78, 85, 77.9, 400),
    makeCandle(78, 68, 78, 67.9, 400),
    makeCandle(68, 55, 68, 54.9, 400),
    makeCandle(55, 50, 55, 49.9, 400),
    makeCandle(50, 55, 56, 50.01, 300),
    makeCandle(55, 60, 61, 55.01, 300),
    makeCandle(60, 65, 66, 60.01, 300),
  ];
  const cvd = cumulativeCvd(candles);
  const result = detectCvdDivergence({ candles, cvdValues: cvd });
  assert.equal(result.state, CVD_STATES.BULLISH_DIVERGENCE);
});

test("detectCvdDivergence detects bearish divergence (price HH, CVD LH)", () => {
  const candles = [
    makeCandle(100, 100.5, 101, 99.5, 500),
    makeCandle(100.5, 100, 101, 99.5, 500),
    makeCandle(100, 100.5, 101, 99.5, 500),
    makeCandle(100.5, 110, 110.1, 100.5, 3000),
    makeCandle(110, 120, 120.1, 110, 3000),
    makeCandle(120, 130, 130.1, 120, 3000),
    makeCandle(130, 140, 140.1, 130, 3000),
    makeCandle(140, 150, 150.1, 140, 3000),
    makeCandle(150, 145, 150, 144.9, 1000),
    makeCandle(145, 138, 145, 137.9, 1000),
    makeCandle(138, 130, 138, 129.9, 1000),
    makeCandle(130, 122, 130, 121.9, 1000),
    makeCandle(122, 120, 122, 119.9, 1000),
    makeCandle(120, 125, 125.1, 120, 400),
    makeCandle(125, 132, 132.1, 125, 400),
    makeCandle(132, 142, 142.1, 132, 400),
    makeCandle(142, 152, 152.1, 142, 400),
    makeCandle(152, 160, 160.1, 152, 400),
    makeCandle(160, 155, 160, 154.9, 300),
    makeCandle(155, 150, 155, 149.9, 300),
    makeCandle(150, 145, 150, 144.9, 300),
  ];
  const cvd = cumulativeCvd(candles);
  const result = detectCvdDivergence({ candles, cvdValues: cvd });
  assert.equal(result.state, CVD_STATES.BEARISH_DIVERGENCE);
});

test("computeCvdState returns insufficient_data for short candles", () => {
  assert.equal(computeCvdState({ candles: null }).state, CVD_STATES.INSUFFICIENT_DATA);
  assert.equal(computeCvdState({ candles: [] }).state, CVD_STATES.INSUFFICIENT_DATA);
  assert.equal(
    computeCvdState({ candles: [makeCandle(1, 1, 1, 1, 100)] }).state,
    CVD_STATES.INSUFFICIENT_DATA,
  );
});

test("computeCvdState passes through divergence detection", () => {
  const candles = [];
  for (let i = 0; i < 30; i += 1) {
    candles.push(makeCandle(100 + i, 101 + i, 102 + i, 99 + i, 1000));
  }
  const result = computeCvdState({ candles });
  assert.ok(
    result.state === CVD_STATES.NONE || result.state === CVD_STATES.INSUFFICIENT_DATA,
    `expected NONE or INSUFFICIENT_DATA, got ${result.state}`,
  );
});
