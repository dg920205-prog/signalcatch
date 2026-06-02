import assert from "node:assert/strict";
import test from "node:test";

import {
  buildModeJobs,
  partitionOosTrades,
  presetDateWindow,
  selectBybitSymbols,
} from "../js/backtest/workflow.js";

test("buildModeJobs preserves each configured candle interval", () => {
  assert.deepEqual(
    buildModeJobs(["scalp", "day", "daily", "swing"], {
      scalp: { interval: "15", waitCandles: 6 },
      day: { interval: "60", waitCandles: 12 },
      daily: { interval: "240", waitCandles: 6 },
      swing: { interval: "D", waitCandles: 4 },
    }),
    [
      { mode: "scalp", interval: "15", waitCandles: 6 },
      { mode: "day", interval: "60", waitCandles: 12 },
      { mode: "daily", interval: "240", waitCandles: 6 },
      { mode: "swing", interval: "D", waitCandles: 4 },
    ],
  );
});

test("selectBybitSymbols excludes Binance-only manual assets", () => {
  assert.deepEqual(
    selectBybitSymbols([
      { symbol: "HBAR", exchange: "Bybit" },
      { symbol: "BTC", exchange: "Binance" },
      { symbol: "ETH", exchange: "Bybit" },
    ]),
    ["HBAR", "ETH"],
  );
});

test("partitionOosTrades returns separate in-sample and OOS collections", () => {
  assert.deepEqual(
    partitionOosTrades(
      [
        { signalIndex: 7, symbol: "BTC" },
        { signalIndex: 8, symbol: "BTC" },
        { signalIndex: 9, symbol: "BTC" },
      ],
      10,
    ),
    {
      splitIndex: 8,
      inSample: [{ signalIndex: 7, symbol: "BTC", oosBucket: "in-sample" }],
      outOfSample: [
        { signalIndex: 8, symbol: "BTC", oosBucket: "out-of-sample" },
        { signalIndex: 9, symbol: "BTC", oosBucket: "out-of-sample" },
      ],
    },
  );
});

test("presetDateWindow returns inclusive UTC dates", () => {
  assert.deepEqual(presetDateWindow(30, new Date("2026-06-02T12:00:00Z")), {
    startDate: "2026-05-04",
    endDate: "2026-06-02",
  });
});
