import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFvgs, detectOrderBlocks, detectSweeps } from "../js/analysis/ict-zones.js";

function c(open, high, low, close, volume = 100) {
  return { open, high, low, close, volume };
}

test("detectFvgs returns empty for short or invalid input", () => {
  assert.deepEqual(detectFvgs(null, { atrValue: 2 }), []);
  assert.deepEqual(detectFvgs([], { atrValue: 2 }), []);
  assert.deepEqual(detectFvgs([c(1, 2, 0.5, 1.5)], { atrValue: 2 }), []);
});

test("detectFvgs detects bullish FVG (c2.low > c0.high)", () => {
  const candles = [
    c(100, 100, 98, 99),
    c(99, 110, 99, 109, 500),
    c(109, 112, 105, 110),
  ];
  const fvgs = detectFvgs(candles, { atrValue: 2 });
  assert.equal(fvgs.length, 1);
  assert.equal(fvgs[0].type, "bullish");
  assert.equal(fvgs[0].bottom, 100);
  assert.equal(fvgs[0].top, 105);
  assert.equal(fvgs[0].ce, 102.5);
});

test("detectFvgs detects bearish FVG (c2.high < c0.low)", () => {
  const candles = [
    c(100, 102, 100, 101),
    c(101, 101, 90, 91, 500),
    c(91, 95, 88, 90),
  ];
  const fvgs = detectFvgs(candles, { atrValue: 2 });
  assert.equal(fvgs.length, 1);
  assert.equal(fvgs[0].type, "bearish");
  assert.equal(fvgs[0].top, 100);
  assert.equal(fvgs[0].bottom, 95);
});

test("detectFvgs rejects FVG when displacement body below ATR threshold", () => {
  const candles = [
    c(100, 100, 98, 99),
    c(99, 101, 99, 100, 500),
    c(100, 112, 105, 110),
  ];
  assert.deepEqual(detectFvgs(candles, { atrValue: 2 }), []);
});

test("detectOrderBlocks derives bullish OB from last bearish candle before displacement", () => {
  const candles = [
    c(95, 96, 94, 95),
    c(102, 102, 98, 99),
    c(99, 110, 99, 109, 500),
    c(109, 112, 105, 110),
  ];
  const obs = detectOrderBlocks(candles, { atrValue: 2 });
  assert.ok(obs.length >= 1, "expected at least one OB");
  const bull = obs.find((o) => o.type === "bullish");
  assert.ok(bull, "expected a bullish OB");
  assert.equal(bull.index, 1);
});

test("detectSweeps detects bullish sweep (pierces swing low, closes above)", () => {
  const candles = [
    c(110, 111, 109, 110),
    c(110, 111, 105, 106),
    c(106, 107, 95, 96),
    c(96, 97, 90, 91),
    c(91, 100, 91, 99),
    c(99, 105, 98, 104),
    c(104, 106, 88, 103),
    c(103, 108, 102, 107),
    c(107, 110, 106, 109),
  ];
  const sweeps = detectSweeps(candles, { swingLookback: 2 });
  const bull = sweeps.find((s) => s.type === "bullish");
  assert.ok(bull, "expected a bullish sweep");
  assert.equal(bull.index, 6);
});

test("detectSweeps returns empty for short input", () => {
  assert.deepEqual(detectSweeps([c(1, 2, 0.5, 1.5)], { swingLookback: 2 }), []);
  assert.deepEqual(detectSweeps(null, { swingLookback: 2 }), []);
});
