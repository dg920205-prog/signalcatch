import { test } from "node:test";
import assert from "node:assert/strict";
import { adx } from "../js/analysis/indicators.js";

function syntheticCandles(count, mode = "uptrend") {
  const candles = [];
  let price = 1000;
  for (let i = 0; i < count; i += 1) {
    let move;
    if (mode === "uptrend") move = 1.5;
    else if (mode === "downtrend") move = -1.5;
    else if (mode === "ranging") move = i % 2 === 0 ? 0.3 : -0.3;
    else move = 0;
    const open = price;
    const close = price + move;
    const high = Math.max(open, close) + 0.5;
    const low = Math.min(open, close) - 0.5;
    candles.push({ open, high, low, close, volume: 1000 });
    price = close;
  }
  return candles;
}

test("adx returns null for insufficient candles", () => {
  assert.equal(adx([], 14), null);
  assert.equal(adx(syntheticCandles(20), 14), null);
  assert.equal(adx(syntheticCandles(28), 14), null);
});

test("adx returns null for non-array input", () => {
  assert.equal(adx(null, 14), null);
  assert.equal(adx(undefined, 14), null);
  assert.equal(adx("not array", 14), null);
});

test("adx returns null for invalid period", () => {
  assert.equal(adx(syntheticCandles(50), 0), null);
  assert.equal(adx(syntheticCandles(50), -1), null);
  assert.equal(adx(syntheticCandles(50), 1.5), null);
});

test("adx returns null for invalid candle data", () => {
  const candles = syntheticCandles(50);
  candles[10].high = NaN;
  assert.equal(adx(candles, 14), null);
});

test("adx returns high value for strong uptrend", () => {
  const result = adx(syntheticCandles(100, "uptrend"), 14);
  assert.equal(typeof result, "number");
  assert.ok(result > 25, `expected ADX > 25 for strong uptrend, got ${result}`);
});

test("adx returns high value for strong downtrend", () => {
  const result = adx(syntheticCandles(100, "downtrend"), 14);
  assert.equal(typeof result, "number");
  assert.ok(result > 25, `expected ADX > 25 for strong downtrend, got ${result}`);
});

test("adx returns low value for ranging market", () => {
  const result = adx(syntheticCandles(100, "ranging"), 14);
  assert.equal(typeof result, "number");
  assert.ok(result < 25, `expected ADX < 25 for ranging market, got ${result}`);
});

test("adx is bounded between 0 and 100", () => {
  for (const mode of ["uptrend", "downtrend", "ranging"]) {
    const result = adx(syntheticCandles(100, mode), 14);
    assert.ok(result >= 0 && result <= 100, `ADX out of bounds for ${mode}: ${result}`);
  }
});
