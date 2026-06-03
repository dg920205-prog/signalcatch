import assert from "node:assert/strict";
import test from "node:test";

import { buildDashboardContext } from "../js/analysis/dashboard-context.js";

function trendCandles(start, step, count = 30) {
  return Array.from({ length: count }, (_, index) => ({
    time: index + 1,
    close: start + step * index,
  }));
}

test("dashboard context separates automated inputs from visual references", () => {
  const context = buildDashboardContext({
    btcCandles: trendCandles(100, 2),
    ethCandles: trendCandles(300, -3),
    altTiles: [
      { symbol: "SOL", status: "ready", score: -40 },
      { symbol: "XRP", status: "ready", score: 20 },
    ],
  });

  assert.deepEqual(context.automatedInputs, ["BTC", "ETH", "BTC/ETH", "Bybit 알트 시장 폭"]);
  assert.deepEqual(context.referenceIndicators, ["BTC.D", "USDT.D", "OTHERS.D", "OTHERS", "TOTAL3ES"]);
  assert.equal(context.cards.length, 8);
  assert.equal(context.cards.find(({ symbol }) => symbol === "BTC.D").source, "reference");
});

test("dashboard context labels aligned rising markets as bullish", () => {
  const context = buildDashboardContext({
    btcCandles: trendCandles(100, 2),
    ethCandles: trendCandles(200, 2),
    altTiles: [{ symbol: "SOL", status: "ready", score: 45 }],
  });

  assert.equal(context.direction, "bullish");
  assert.match(context.label, /상승/);
});

test("dashboard context labels mixed conditions as neutral", () => {
  const context = buildDashboardContext({
    btcCandles: trendCandles(100, 2),
    ethCandles: trendCandles(200, -2),
    altTiles: [{ symbol: "SOL", status: "ready", score: -20 }],
  });

  assert.equal(context.direction, "neutral");
  assert.match(context.label, /혼조|중립/);
});
