import assert from "node:assert/strict";
import test from "node:test";

import {
  BACKTEST_DEFAULTS,
  BINANCE_BASE_URL,
  MODE_CONFIG,
} from "../js/config.js";

test("backtest defaults use the expected round-trip costs", () => {
  assert.equal(BACKTEST_DEFAULTS.roundTripFeePct, 0.11);
  assert.equal(BACKTEST_DEFAULTS.roundTripSlippagePct, 0.2);
});

test("mode config uses the expected wait candles", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(MODE_CONFIG).map(([mode, config]) => [
        mode,
        config.waitCandles,
      ]),
    ),
    {
      common: 8,
      scalp: 6,
      day: 12,
      daily: 6,
      swing: 4,
    },
  );
});

test("mode config uses the expected labels", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(MODE_CONFIG).map(([mode, config]) => [mode, config.label]),
    ),
    {
      common: "공통 확정",
      scalp: "스캘핑",
      day: "단타",
      daily: "데일리",
      swing: "스윙",
    },
  );
});

test("mode config uses the expected intervals", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(MODE_CONFIG).map(([mode, config]) => [
        mode,
        config.interval,
      ]),
    ),
    {
      common: "60",
      scalp: "15",
      day: "60",
      daily: "240",
      swing: "D",
    },
  );
});

test("Binance base URL targets futures API", () => {
  assert.equal(BINANCE_BASE_URL, "https://fapi.binance.com");
});
