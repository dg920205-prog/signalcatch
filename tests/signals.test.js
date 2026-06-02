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

function trendingCandles(start, step) {
  return Array.from({ length: 30 }, (_, index) =>
    candle(start + step * index, 100 + index * 10),
  );
}

test("returns a neutral analysis when candles are insufficient", () => {
  assert.deepEqual(analyzeCandles([candle(100), candle(101)]), {
    direction: "neutral",
    score: 0,
    confidence: 0,
    reasons: ["분석에 필요한 캔들이 부족합니다."],
  });
});

test("returns independent reasons arrays for insufficient candles", () => {
  const first = analyzeCandles([]);
  const second = analyzeCandles([]);

  first.reasons.push("mutated");

  assert.notEqual(first.reasons, second.reasons);
  assert.deepEqual(second.reasons, ["분석에 필요한 캔들이 부족합니다."]);
});

test("builds a bullish trade plan", () => {
  assert.deepEqual(buildTradePlan({ direction: "bull", close: 100, atr: 4 }), {
    direction: "bull",
    entryLow: 98,
    entryHigh: 100,
    tp: 106,
    sl: 96,
    rr: 1.5,
  });
});

test("builds a symmetric bearish trade plan", () => {
  assert.deepEqual(buildTradePlan({ direction: "bear", close: 100, atr: 4 }), {
    direction: "bear",
    entryLow: 100,
    entryHigh: 102,
    tp: 94,
    sl: 104,
    rr: 1.5,
  });
});

test("rejects invalid trade plan inputs", () => {
  assert.equal(buildTradePlan({ direction: "neutral", close: 100, atr: 4 }), null);
  assert.equal(buildTradePlan({ direction: "bull", close: 100, atr: 0 }), null);
  assert.equal(
    buildTradePlan({ direction: "bull", close: Number.MAX_VALUE, atr: 4 }),
    null,
  );
});

test("uses the conservative entry price for the declared reward-risk ratio", () => {
  const bull = buildTradePlan({ direction: "bull", close: 100, atr: 4 });
  const bear = buildTradePlan({ direction: "bear", close: 100, atr: 4 });

  assert.equal((bull.tp - bull.entryHigh) / (bull.entryHigh - bull.sl), bull.rr);
  assert.equal((bear.entryLow - bear.tp) / (bear.sl - bear.entryLow), bear.rr);
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

test("analyzes rising candles with the complete signal contract", () => {
  const analysis = analyzeCandles(trendingCandles(100, 2));

  assert.equal(analysis.direction, "bull");
  assert.equal(typeof analysis.score, "number");
  assert.equal(typeof analysis.confidence, "number");
  assert.equal(typeof analysis.atr, "number");
  assert.equal(analysis.close, 158);
  assert.equal(typeof analysis.volumeRatio, "number");
  assert.equal(typeof analysis.trendStrength, "number");
  assert.equal(Array.isArray(analysis.reasons), true);
  assert.equal(analysis.reasons.some((reason) => /[가-힣]/.test(reason)), true);
});

test("analyzes falling candles as bearish", () => {
  const analysis = analyzeCandles(trendingCandles(200, -2));

  assert.equal(analysis.direction, "bear");
  assert.equal(analysis.score < 0, true);
  assert.equal(analysis.confidence > 0, true);
  assert.equal(Array.isArray(analysis.reasons), true);
});

test("returns a concrete neutral reason for invalid OHLCV candles", () => {
  for (const [field, value] of [
    ["close", 0],
    ["close", Number.NaN],
    ["close", Number.POSITIVE_INFINITY],
    ["open", 0],
    ["open", Number.POSITIVE_INFINITY],
    ["high", 0],
    ["high", Number.NaN],
    ["low", 0],
    ["low", Number.POSITIVE_INFINITY],
    ["volume", -1],
    ["volume", Number.POSITIVE_INFINITY],
  ]) {
    const candles = trendingCandles(100, 2);
    candles.at(-1)[field] = value;

    assert.deepEqual(analyzeCandles(candles), {
      direction: "neutral",
      score: 0,
      confidence: 0,
      reasons: ["유효한 캔들 데이터가 필요합니다."],
    });
  }
});

test("returns a neutral result for impossible OHLC candles", () => {
  for (const [field, value] of [
    ["open", 161],
    ["open", 155],
    ["close", 161],
    ["close", 155],
  ]) {
    const candles = trendingCandles(100, 2);
    candles.at(-1)[field] = value;

    assert.deepEqual(analyzeCandles(candles), {
      direction: "neutral",
      score: 0,
      confidence: 0,
      reasons: ["유효한 캔들 데이터가 필요합니다."],
    });
  }
});

test("returns a neutral result when trend strength overflows", () => {
  const candles = trendingCandles(100, 2);
  candles.at(-1).open = Number.MIN_VALUE;
  candles.at(-1).high = Number.MIN_VALUE;
  candles.at(-1).low = Number.MIN_VALUE;
  candles.at(-1).close = Number.MIN_VALUE;

  assert.deepEqual(analyzeCandles(candles), {
    direction: "neutral",
    score: 0,
    confidence: 0,
    reasons: ["유효한 캔들 데이터가 필요합니다."],
  });
});

test("classifies every supported mode with a stable result shape", () => {
  const modes = classifyModes({
    direction: "bull",
    confidence: 74,
    volumeRatio: 1.3,
    trendStrength: 0.04,
  });

  assert.deepEqual(Object.keys(modes), [
    "common",
    "scalp",
    "day",
    "daily",
    "swing",
  ]);

  for (const mode of Object.values(modes)) {
    assert.equal(typeof mode.eligible, "boolean");
    assert.equal(Array.isArray(mode.reasons), true);
  }
});

test("rejects invalid mode classification inputs", () => {
  const validAnalysis = {
    direction: "bull",
    confidence: 74,
    volumeRatio: 1.3,
    trendStrength: 0.04,
  };
  const invalidAnalyses = [
    { ...validAnalysis, direction: "sideways" },
    ...["confidence", "volumeRatio", "trendStrength"].flatMap((field) => [
      { ...validAnalysis, [field]: Number.POSITIVE_INFINITY },
      { ...validAnalysis, [field]: String(validAnalysis[field]) },
    ]),
  ];

  for (const analysis of invalidAnalyses) {
    const modes = classifyModes(analysis);

    for (const mode of Object.values(modes)) {
      assert.equal(mode.eligible, false);
      assert.equal(Array.isArray(mode.reasons), true);
    }
  }
});

test("rejects out-of-range mode classification inputs", () => {
  const validAnalysis = {
    direction: "bull",
    confidence: 74,
    volumeRatio: 1.3,
    trendStrength: 0.04,
  };

  for (const analysis of [
    { ...validAnalysis, confidence: -1 },
    { ...validAnalysis, confidence: 101 },
    { ...validAnalysis, volumeRatio: -0.1 },
    { ...validAnalysis, trendStrength: -0.01 },
  ]) {
    const modes = classifyModes(analysis);

    for (const mode of Object.values(modes)) {
      assert.equal(mode.eligible, false);
      assert.equal(Array.isArray(mode.reasons), true);
    }
  }
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

test("rejects impossible and non-positive ATR candles", () => {
  for (const malformed of [
    { high: 12, low: 10, close: 13 },
    { high: 12, low: 10, close: 9 },
    { high: 12, low: -1, close: 10 },
    { high: 0, low: 0, close: 0 },
  ]) {
    assert.equal(atr([malformed, candle(11), candle(12)], 3), null);
  }
});

test("calculates current volume ratio from preceding candles only", () => {
  assert.equal(
    volumeRatio([candle(10, 100), candle(11, 200), candle(12, 450)], 2),
    3,
  );
  assert.equal(volumeRatio([candle(10, 100), candle(11, 200)], 2), null);
});

test("returns null when indicator calculations overflow", () => {
  const max = Number.MAX_VALUE;

  assert.equal(sma([max, max], 2), null);
  assert.equal(ema([max, max], 2), null);
  assert.equal(rsi([max, -max, max], 2), null);
  assert.equal(
    atr(
      [
        { high: max, low: 1, close: max },
        { high: max, low: 1, close: max },
      ],
      2,
    ),
    null,
  );
  assert.equal(
    volumeRatio([candle(10, max), candle(11, max), candle(12, max)], 2),
    null,
  );
});
