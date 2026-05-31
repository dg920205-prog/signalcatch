import assert from "node:assert/strict";
import test from "node:test";

import {
  runBacktest,
  simulatePlannedTrade,
} from "../js/backtest/engine.js";

const bullPlan = {
  direction: "bull",
  entryLow: 99,
  entryHigh: 100,
  tp: 106,
  sl: 96,
  rr: 1.5,
};

const bearPlan = {
  direction: "bear",
  entryLow: 100,
  entryHigh: 101,
  tp: 94,
  sl: 104,
  rr: 1.5,
};

function candle({ open = 102, high = 103, low = 101, close = 102, time = 0 } = {}) {
  return { open, high, low, close, time };
}

test("returns unfilled when the entry zone is not touched", () => {
  assert.deepEqual(
    simulatePlannedTrade({
      plan: bullPlan,
      futureCandles: [candle(), candle({ time: 1 })],
      waitCandles: 2,
      costPct: 0.31,
    }),
    { status: "unfilled" },
  );
});

test("prioritizes the stop loss when a bullish entry candle touches TP and SL", () => {
  assert.deepEqual(
    simulatePlannedTrade({
      plan: bullPlan,
      futureCandles: [
        candle({ open: 100, high: 107, low: 95, close: 101 }),
      ],
      waitCandles: 1,
      costPct: 0.31,
    }),
    {
      status: "closed",
      outcome: "loss",
      entryPrice: 100,
      exitPrice: 96,
      pnlPct: -4.31,
      holdCandles: 0,
    },
  );
});

test("prioritizes the stop loss when a bearish entry candle touches TP and SL", () => {
  assert.deepEqual(
    simulatePlannedTrade({
      plan: bearPlan,
      futureCandles: [
        candle({ open: 100, high: 105, low: 93, close: 100 }),
      ],
      waitCandles: 1,
      costPct: 0.31,
    }),
    {
      status: "closed",
      outcome: "loss",
      entryPrice: 100,
      exitPrice: 104,
      pnlPct: -4.31,
      holdCandles: 0,
    },
  );
});

test("subtracts round-trip costs from winning pnl", () => {
  assert.deepEqual(
    simulatePlannedTrade({
      plan: bullPlan,
      futureCandles: [
        candle({ open: 101, high: 102, low: 99, close: 100 }),
        candle({ open: 103, high: 106, low: 101, close: 105, time: 1 }),
      ],
      waitCandles: 1,
      costPct: 0.31,
    }),
    {
      status: "closed",
      outcome: "win",
      entryPrice: 100,
      exitPrice: 106,
      pnlPct: 5.69,
      holdCandles: 1,
    },
  );
});

test("returns open when history ends before an exit", () => {
  assert.deepEqual(
    simulatePlannedTrade({
      plan: bullPlan,
      futureCandles: [
        candle({ open: 101, high: 102, low: 99, close: 100 }),
        candle({ open: 102, high: 103, low: 101, close: 102, time: 1 }),
      ],
      waitCandles: 1,
      costPct: 0,
    }),
    {
      status: "open",
      entryPrice: 100,
      holdCandles: 1,
    },
  );
});

test("searches for entry only through the wait candle boundary", () => {
  const miss = candle({ time: 0 });
  const touch = candle({ open: 101, high: 102, low: 99, close: 100, time: 1 });

  assert.deepEqual(
    simulatePlannedTrade({
      plan: bullPlan,
      futureCandles: [miss, touch],
      waitCandles: 1,
      costPct: 0,
    }),
    { status: "unfilled" },
  );
  assert.deepEqual(
    simulatePlannedTrade({
      plan: bullPlan,
      futureCandles: [miss, touch],
      waitCandles: 2,
      costPct: 0,
    }),
    { status: "open", entryPrice: 100, holdCandles: 0 },
  );
});

test("rejects invalid costs, waits, plans, and candles", () => {
  const valid = {
    plan: bullPlan,
    futureCandles: [candle()],
    waitCandles: 1,
    costPct: 0,
  };

  for (const costPct of [-0.01, 10.01, Number.POSITIVE_INFINITY, "0.31"]) {
    assert.throws(() => simulatePlannedTrade({ ...valid, costPct }), TypeError);
  }
  for (const waitCandles of [-1, 1.5, Number.POSITIVE_INFINITY, "1"]) {
    assert.throws(() => simulatePlannedTrade({ ...valid, waitCandles }), TypeError);
  }
  for (const plan of [
    null,
    { ...bullPlan, direction: "neutral" },
    { ...bullPlan, entryLow: 101 },
    { ...bullPlan, tp: Number.NaN },
  ]) {
    assert.throws(() => simulatePlannedTrade({ ...valid, plan }), TypeError);
  }
  for (const malformed of [
    { ...candle(), high: Number.NaN },
    { ...candle(), low: 0 },
    { ...candle(), open: 104 },
    { ...candle(), close: 100 },
  ]) {
    assert.throws(
      () => simulatePlannedTrade({ ...valid, futureCandles: [malformed] }),
      TypeError,
    );
  }
});

test("accepts the maximum planned trade cost", () => {
  assert.deepEqual(
    simulatePlannedTrade({
      plan: bullPlan,
      futureCandles: [candle()],
      waitCandles: 1,
      costPct: 10,
    }),
    { status: "unfilled" },
  );
});

test("rejects non-finite pnl calculations from extreme finite prices", () => {
  const min = Number.MIN_VALUE;
  const plan = {
    direction: "bull",
    entryLow: min * 2,
    entryHigh: min * 3,
    tp: Number.MAX_VALUE,
    sl: min,
    rr: 1.5,
  };

  assert.throws(
    () =>
      simulatePlannedTrade({
        plan,
        futureCandles: [
          candle({
            open: min * 3,
            high: Number.MAX_VALUE,
            low: min * 2,
            close: min * 3,
          }),
        ],
        waitCandles: 1,
        costPct: 0,
      }),
    TypeError,
  );
});

test("runBacktest passes only historical candles into signal analysis", () => {
  const candles = Array.from({ length: 4 }, (_, index) =>
    candle({ open: 101, high: 102, low: 99, close: 100, time: index }),
  );
  const seenTimes = [];
  const analyze = (history) => {
    seenTimes.push(history.at(-1).time);
    return { direction: "bull" };
  };
  const classify = () => ({ common: { eligible: true } });
  const makePlan = () => bullPlan;

  const results = runBacktest({
    candles,
    mode: "common",
    waitCandles: 1,
    feePct: 0.1,
    slippagePct: 0.05,
    analyze,
    classify,
    makePlan,
    symbol: "BTCUSDT",
  });

  assert.deepEqual(seenTimes, [0, 1, 2, 3]);
  assert.equal(results.length, 3);
  assert.equal(results[0].symbol, "BTCUSDT");
  assert.equal(results[0].signalIndex, 0);
  assert.equal(results[0].status, "open");
});

test("changing future candles cannot change earlier signal analysis input", () => {
  const original = Array.from({ length: 3 }, (_, index) =>
    candle({ open: 101, high: 102, low: 99, close: 100, time: index }),
  );
  const changed = original.map((item) => ({ ...item }));
  changed[2] = candle({ open: 200, high: 201, low: 199, close: 200, time: 2 });
  const snapshots = [];
  const analyze = (history) => {
    snapshots.push(history.map(({ time, close }) => ({ time, close })));
    return { direction: "bull" };
  };
  const dependencies = {
    mode: "common",
    waitCandles: 1,
    feePct: 0,
    slippagePct: 0,
    analyze,
    classify: () => ({ common: { eligible: true } }),
    makePlan: () => bullPlan,
  };

  runBacktest({ ...dependencies, candles: original });
  const originalSnapshots = snapshots.splice(0);
  runBacktest({ ...dependencies, candles: changed });

  assert.deepEqual(snapshots[0], originalSnapshots[0]);
  assert.deepEqual(snapshots[1], originalSnapshots[1]);
});

test("runBacktest checks the selected mode and combines fees with slippage", () => {
  const results = runBacktest({
    candles: [
      candle({ open: 101, high: 102, low: 101, close: 101 }),
      candle({ open: 100, high: 106, low: 99, close: 105, time: 1 }),
    ],
    mode: "day",
    waitCandles: 1,
    feePct: 0.2,
    slippagePct: 0.11,
    analyze: () => ({ direction: "bull" }),
    classify: () => ({
      common: { eligible: true },
      day: { eligible: true },
    }),
    makePlan: () => bullPlan,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].pnlPct, 5.69);
});

test("runBacktest rejects malformed options", () => {
  const valid = {
    candles: [candle()],
    mode: "common",
    waitCandles: 1,
    feePct: 0,
    slippagePct: 0,
  };

  for (const options of [
    { ...valid, candles: "candles" },
    { ...valid, mode: "weekly" },
    { ...valid, feePct: -1 },
    { ...valid, feePct: 10.01 },
    { ...valid, feePct: Number.POSITIVE_INFINITY },
    { ...valid, feePct: "0.1" },
    { ...valid, slippagePct: Number.NaN },
    { ...valid, slippagePct: 10.01 },
    { ...valid, slippagePct: Number.POSITIVE_INFINITY },
    { ...valid, slippagePct: "0.1" },
    { ...valid, feePct: 6, slippagePct: 4.01 },
    { ...valid, waitCandles: 0.5 },
    { ...valid, symbol: 123 },
  ]) {
    assert.throws(() => runBacktest(options), TypeError);
  }
});

test("runBacktest accepts the maximum combined cost", () => {
  assert.deepEqual(
    runBacktest({
      candles: [candle()],
      mode: "common",
      waitCandles: 1,
      feePct: 6,
      slippagePct: 4,
    }),
    [],
  );
});
