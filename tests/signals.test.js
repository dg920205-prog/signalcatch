import assert from "node:assert/strict";
import test from "node:test";

import { atr, ema, rsi, sma, volumeRatio } from "../js/analysis/indicators.js";
import { analyzeCandles, classifyModes } from "../js/analysis/signals.js";
import { buildTradePlan } from "../js/analysis/trade-plan.js";

function candle(close, volume = 100) {
  return {
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume,
  };
}

test("returns a neutral analysis when candles are insufficient", () => {
  assert.deepEqual(analyzeCandles([candle(100), candle(101)]), {
    direction: "neutral",
    score: 0,
    confidence: 0,
    reasons: ["분석에 필요한 캔들이 부족합니다."],
  });
});

test("builds a bullish trade plan", () => {
  assert.deepEqual(buildTradePlan({ direction: "bull", close: 100, atr: 4 }), {
    direction: "bull",
    entryLow: 98,
    entryHigh: 100,
    tp: 106,
    sl: 94,
    rr: 1.5,
  });
});

test("builds a symmetric bearish trade plan", () => {
  assert.deepEqual(buildTradePlan({ direction: "bear", close: 100, atr: 4 }), {
    direction: "bear",
    entryLow: 100,
    entryHigh: 102,
    tp: 94,
    sl: 106,
    rr: 1.5,
  });
});

test("rejects invalid trade plan inputs", () => {
  assert.equal(buildTradePlan({ direction: "neutral", close: 100, atr: 4 }), null);
  assert.equal(buildTradePlan({ direction: "bull", close: 100, atr: 0 }), null);
});

test("classifies common and day modes independently", () => {
  const modes = classifyModes({
    direction: "bull",
    confidence: 74,
    volumeRatio: 1.3,
    trendStrength: 0.04,
  });

  assert.equal(modes.common.eligible, true);
  assert.equal(modes.day.eligible, true);
  assert.equal(typeof modes.swing.eligible, "boolean");
});

test("calculates SMA and returns null for short input", () => {
  assert.equal(sma([1, 2, 3, 4], 3), 3);
  assert.equal(sma([1, 2], 3), null);
});

test("calculates EMA and returns null for short input", () => {
  assert.equal(ema([1, 2, 3, 4], 3), 3);
  assert.equal(ema([1, 2], 3), null);
});

test("calculates RSI and returns null for short input", () => {
  assert.equal(rsi([1, 2, 3, 4], 3), 100);
  assert.equal(rsi([1, 2, 3], 3), null);
});

test("calculates ATR and returns null for short input", () => {
  assert.equal(atr([candle(10), candle(11), candle(12)], 3), 4);
  assert.equal(atr([candle(10), candle(11)], 3), null);
});

test("rejects malformed ATR candles", () => {
  assert.equal(
    atr(
      [
        { high: 8, low: 10, close: 9 },
        candle(11),
        candle(12),
      ],
      3,
    ),
    null,
  );
});

test("calculates current volume ratio from preceding candles only", () => {
  assert.equal(
    volumeRatio([candle(10, 100), candle(11, 200), candle(12, 450)], 2),
    3,
  );
  assert.equal(volumeRatio([candle(10, 100), candle(11, 200)], 2), null);
});
