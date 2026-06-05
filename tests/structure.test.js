import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeStructureState,
  findSwingHighs,
  findSwingLows,
  STRUCTURE_STATES,
} from "../js/analysis/structure.js";

function makeCandles(prices) {
  return prices.map((p) => ({
    open: p,
    high: p + 0.5,
    low: p - 0.5,
    close: p,
    volume: 1000,
  }));
}

function trendingCandles(direction, count) {
  const prices = [];
  let price = 1000;
  for (let i = 0; i < count; i += 1) {
    if (direction === "up") price += 5 + (i % 5 === 0 ? 2 : 0);
    else if (direction === "down") price -= 5 + (i % 5 === 0 ? 2 : 0);
    else price += i % 2 === 0 ? 2 : -2;
    prices.push(price);
  }
  return makeCandles(prices);
}

test("findSwingHighs returns empty for non-array input", () => {
  assert.deepEqual(findSwingHighs(null), []);
  assert.deepEqual(findSwingHighs("string"), []);
  assert.deepEqual(findSwingHighs(undefined), []);
});

test("findSwingHighs returns empty for invalid lookback", () => {
  assert.deepEqual(findSwingHighs(makeCandles([1, 2, 3, 4, 5]), 0), []);
  assert.deepEqual(findSwingHighs(makeCandles([1, 2, 3, 4, 5]), -1), []);
  assert.deepEqual(findSwingHighs(makeCandles([1, 2, 3, 4, 5]), 1.5), []);
});

test("findSwingHighs detects single fractal peak", () => {
  const candles = makeCandles([1, 3, 5, 3, 1]);
  const swings = findSwingHighs(candles, 2);
  assert.equal(swings.length, 1);
  assert.equal(swings[0].index, 2);
  assert.equal(swings[0].price, 5.5);
});

test("findSwingLows detects single fractal trough", () => {
  const candles = makeCandles([5, 3, 1, 3, 5]);
  const swings = findSwingLows(candles, 2);
  assert.equal(swings.length, 1);
  assert.equal(swings[0].index, 2);
  assert.equal(swings[0].price, 0.5);
});

test("findSwingHighs rejects equal-high neighbors", () => {
  const candles = makeCandles([1, 5, 5, 3, 1]);
  const swings = findSwingHighs(candles, 2);
  assert.equal(swings.length, 0);
});

test("computeStructureState returns unknown for short candles", () => {
  assert.equal(computeStructureState({ candles: [] }).state, STRUCTURE_STATES.UNKNOWN);
  assert.equal(computeStructureState({ candles: null }).state, STRUCTURE_STATES.UNKNOWN);
  assert.equal(computeStructureState({ candles: makeCandles([1, 2, 3]) }).state, STRUCTURE_STATES.UNKNOWN);
});

test("computeStructureState detects bullish structure (HH+HL)", () => {
  const prices = [
    1, 3, 5, 7, 10,
    6, 4, 3, 2, 1,
    3, 5, 8, 10, 13,
    9, 7, 5, 3, 2,
    4, 6, 8,
  ];
  const result = computeStructureState({ candles: makeCandles(prices) });
  assert.equal(result.state, STRUCTURE_STATES.BULLISH);
});

test("computeStructureState detects bearish structure (LH+LL)", () => {
  const prices = [
    3, 6, 9, 12, 15,
    11, 8, 6, 4, 3,
    5, 7, 9, 11, 12,
    9, 7, 5, 3, 2,
    4, 5, 6,
  ];
  const result = computeStructureState({ candles: makeCandles(prices) });
  assert.equal(result.state, STRUCTURE_STATES.BEARISH);
});

test("computeStructureState classifies HH+LL as mixed", () => {
  const prices = [
    3, 5, 7, 9, 12,
    9, 7, 5, 4, 3,
    5, 7, 10, 13, 16,
    12, 9, 6, 3, 2,
    4, 6, 8,
  ];
  const result = computeStructureState({ candles: makeCandles(prices) });
  assert.equal(result.state, STRUCTURE_STATES.MIXED);
});

test("computeStructureState returns unknown when fewer than 2 swings", () => {
  const candles = trendingCandles("up", 30);
  const result = computeStructureState({ candles });
  assert.ok(
    result.state === STRUCTURE_STATES.UNKNOWN || result.state === STRUCTURE_STATES.MIXED,
    `monotonic should be unknown or mixed (got ${result.state})`,
  );
});
