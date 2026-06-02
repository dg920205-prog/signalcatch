import assert from "node:assert/strict";
import test from "node:test";

import {
  THEMES,
  buildChartSeries,
  buildMarketBriefing,
  calculateSymbolStrength,
  calculateThemeStrength,
  calculateVolumeChange,
  selectStrongestSetup,
} from "../js/analysis/market-heatmap.js";
import { createMarketService } from "../js/services/market.js";

function candles(count = 60, start = 100) {
  return Array.from({ length: count }, (_, index) => ({
    time: index + 1,
    open: start + index,
    high: start + index + 2,
    low: start + index - 1,
    close: start + index + 1,
    volume: index + 10,
  }));
}

test("fixed themes expose the initial major and discovery categories", () => {
  assert.deepEqual(THEMES.Major, ["BTC", "ETH", "SOL", "XRP"]);
  assert.deepEqual(THEMES.Meme, ["DOGE", "SHIB", "PEPE", "BONK", "WIF"]);
  assert.equal(Object.isFrozen(THEMES), true);
});

test("volume change returns bounded neutral-safe percentages", () => {
  assert.equal(calculateVolumeChange(120, 100), 20);
  assert.equal(calculateVolumeChange(100, 0), 0);
  assert.equal(calculateVolumeChange(undefined, 100), 0);
});

test("symbol strength combines price volume and recent acceleration", () => {
  const result = calculateSymbolStrength({
    change24hPct: 5,
    volumeChange24hPct: 20,
    volumeAcceleration4hPct: 30,
  });

  assert.equal(result.label, "Strong");
  assert.equal(result.score > 0, true);
});

test("theme strength uses turnover weighting so low-volume outliers do not dominate", () => {
  const result = calculateThemeStrength([
    { score: 80, turnover24h: 900 },
    { score: -80, turnover24h: 100 },
  ]);

  assert.equal(result.score > 0, true);
  assert.equal(result.label, "Strong");
});

test("strongest setup prefers higher recommendation confidence", () => {
  const setup = selectStrongestSetup({
    common: { mode: "common", recommendation: { label: "비추천" } },
    daily: { mode: "daily", recommendation: { label: "추천" } },
    swing: { mode: "swing", recommendation: { label: "주의" } },
  });

  assert.equal(setup.mode, "daily");
});

test("briefing states direction recommendation and analysis-only boundary", () => {
  const briefing = buildMarketBriefing({
    symbol: "BTC",
    setup: { direction: "bull", recommendation: { label: "추천" } },
    strength: { label: "Strong", score: 42 },
  });

  assert.match(briefing, /BTC/);
  assert.match(briefing, /bull/);
  assert.match(briefing, /추천/);
  assert.match(briefing, /분석/);
});

test("chart series returns closing prices and short and long averages", () => {
  const candles = Array.from({ length: 30 }, (_, index) => ({
    time: index + 1,
    close: index + 10,
  }));
  const series = buildChartSeries(candles);

  assert.equal(series.prices.length, 30);
  assert.equal(series.shortAverage.length, 30);
  assert.equal(series.longAverage.length, 30);
  assert.equal(series.shortAverage[0], null);
  assert.equal(typeof series.shortAverage[29], "number");
  assert.equal(typeof series.longAverage[29], "number");
});

test("market service preserves successful heatmap tiles when one symbol fails", async () => {
  const service = createMarketService({
    bybit: {
      fetchMarketTickers: async () => [
        { symbol: "BTC", price: 100, turnover24h: 1000, change24hPct: 2 },
        { symbol: "ETH", price: 50, turnover24h: 500, change24hPct: -1 },
      ],
      fetchCandles: async (symbol) => {
        if (symbol === "ETH") throw new Error("upstream failure");
        return candles();
      },
    },
    themes: { Major: ["BTC", "ETH"] },
  });

  const result = await service.refresh();
  assert.equal(result.themes.Major.tiles.length, 2);
  assert.equal(result.themes.Major.tiles.find((tile) => tile.symbol === "BTC").status, "ready");
  assert.equal(result.themes.Major.tiles.find((tile) => tile.symbol === "ETH").status, "error");
});

test("market service loads selected chart timeframe and all recommendation modes", async () => {
  const requests = [];
  const service = createMarketService({
    bybit: {
      fetchMarketTickers: async () => [{ symbol: "BTC", price: 100, turnover24h: 1000, change24hPct: 2 }],
      fetchCandles: async (_symbol, options) => {
        requests.push(options.interval);
        return candles();
      },
    },
    themes: { Major: ["BTC"] },
  });

  const detail = await service.loadDetail("BTC", "4H");
  assert.equal(detail.symbol, "BTC");
  assert.equal(detail.timeframe, "4H");
  assert.equal(detail.chart.prices.length, 60);
  assert.deepEqual(Object.keys(detail.setups), ["common", "scalp", "day", "daily", "swing"]);
  assert.equal(requests.includes("240"), true);
});

test("market detail reuses the refreshed symbol strength for its briefing", async () => {
  const service = createMarketService({
    bybit: {
      fetchMarketTickers: async () => [{ symbol: "BTC", price: 100, turnover24h: 1000, change24hPct: 5 }],
      fetchCandles: async () => candles(),
    },
    themes: { Major: ["BTC"] },
  });

  const snapshot = await service.refresh();
  const detail = await service.loadDetail("BTC", "4H");
  assert.equal(detail.strength.score, snapshot.themes.Major.tiles[0].score);
  assert.match(detail.briefing, new RegExp(snapshot.themes.Major.tiles[0].score.toFixed(1)));
});

test("market service caps concurrent heatmap candle requests", async () => {
  let active = 0;
  let maximum = 0;
  const release = [];
  const symbols = ["BTC", "ETH", "SOL", "XRP", "ADA", "AVAX"];
  const service = createMarketService({
    bybit: {
      fetchMarketTickers: async () => symbols.map((symbol) => ({
        symbol,
        price: 100,
        turnover24h: 100,
        change24hPct: 1,
      })),
      fetchCandles: async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => release.push(resolve));
        active -= 1;
        return candles();
      },
    },
    themes: { L1: symbols },
    concurrency: 2,
  });

  const pending = service.refresh();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(maximum, 2);
  while (release.length) {
    release.shift()();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await pending;
  assert.equal(maximum, 2);
});
