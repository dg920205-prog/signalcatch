import assert from "node:assert/strict";
import test from "node:test";

import { BACKTEST_DEFAULTS, MODE_CONFIG } from "../js/config.js";

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
