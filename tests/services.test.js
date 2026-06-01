import assert from "node:assert/strict";
import test from "node:test";

import { analyzeMarketRegime } from "../js/analysis/market-regime.js";
import { createManualAssetService } from "../js/services/manual-assets.js";
import { createScannerService } from "../js/services/scanner.js";

const MODES = ["common", "scalp", "day", "daily", "swing"];

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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });

  return { promise, resolve, reject };
}

function adapters(overrides = {}) {
  return {
    bybit: {
      fetchTicker: async (symbol) => ({ symbol: `${symbol}USDT`, price: 1 }),
      fetchCandles: async () => trendingCandles(100, 2),
      ...overrides.bybit,
    },
    binance: {
      fetchTicker: async (symbol) => ({ symbol: `${symbol}USDT`, price: 2 }),
      fetchCandles: async () => trendingCandles(100, 2),
      ...overrides.binance,
    },
  };
}

test("manual HBAR add is visible while loading and remains visible with no eligible modes", async () => {
  const candles = deferred();
  const service = createManualAssetService(
    adapters({ bybit: { fetchCandles: () => candles.promise } }),
  );

  const pending = service.add({ symbol: " hbarusdt ", exchange: "bybit" });
  const loading = service.list()[0];

  assert.equal(loading.symbol, "HBAR");
  assert.equal(loading.exchange, "Bybit");
  assert.equal(loading.visible, true);
  assert.equal(loading.status, "loading");

  candles.resolve([]);
  const asset = await pending;

  assert.equal(asset.visible, true);
  assert.equal(asset.status, "ready");
  assert.equal(
    MODES.every((mode) => asset.modeResults[mode].eligible === false),
    true,
  );
});

test("manual asset survives API failures with safe diagnostics", async () => {
  const service = createManualAssetService(
    adapters({
      bybit: {
        fetchTicker: async () => {
          throw new Error("remote payload must not leak");
        },
        fetchCandles: async () => {
          throw new Error("private candle response");
        },
      },
    }),
  );

  const asset = await service.add({ symbol: "btc", exchange: "Bybit" });

  assert.equal(asset.visible, true);
  assert.equal(asset.status, "error");
  assert.equal(typeof asset.error, "string");
  assert.equal(asset.diagnostics.length, 2);
  assert.equal(JSON.stringify(asset.diagnostics).includes("remote payload"), false);
  assert.equal(JSON.stringify(asset.diagnostics).includes("private candle"), false);
});

test("manual asset diagnostics allowlist adapter error details", async () => {
  const error = new Error("private upstream message");
  error.kind = "network";
  error.detail = {
    exchange: "Bybit",
    status: 503,
    payload: "private response body",
  };
  const service = createManualAssetService(
    adapters({ bybit: { fetchTicker: async () => { throw error; } } }),
  );

  const asset = await service.add({ symbol: "btc", exchange: "Bybit" });

  assert.equal(asset.diagnostics[0].exchange, "Bybit");
  assert.equal(asset.diagnostics[0].status, 503);
  assert.equal("payload" in asset.diagnostics[0], false);
});

test("manual assets reject duplicates, remove cards, refresh cards, and allow Binance", async () => {
  let binancePrice = 2;
  const service = createManualAssetService(
    adapters({
      binance: {
        fetchTicker: async (symbol) => ({
          symbol: `${symbol}USDT`,
          price: binancePrice,
        }),
      },
    }),
  );

  const bybit = await service.add({ symbol: "btc", exchange: "Bybit" });
  const binance = await service.add({ symbol: "btcusdt", exchange: "binance" });

  await assert.rejects(
    service.add({ symbol: " BTC ", exchange: "BINANCE" }),
    /already exists/i,
  );
  assert.equal(service.list().length, 2);

  binancePrice = 3;
  const refreshed = await service.refresh(binance.id);
  assert.equal(refreshed.ticker.price, 3);

  assert.equal(service.remove(bybit.id), true);
  assert.equal(service.remove(bybit.id), false);
  assert.deepEqual(
    service.list().map((asset) => asset.exchange),
    ["Binance"],
  );
});

test("market regime is neutral with insufficient data", () => {
  const regime = analyzeMarketRegime({ btcCandles: [], ethCandles: [] });

  assert.equal(regime.direction, "neutral");
  assert.equal(Array.isArray(regime.reasons), true);
  assert.equal(regime.reasons.length > 0, true);
});

test("market regime follows aligned rising and falling BTC and ETH analyses", () => {
  const bull = analyzeMarketRegime({
    btcCandles: trendingCandles(100, 2),
    ethCandles: trendingCandles(200, 3),
  });
  const bear = analyzeMarketRegime({
    btcCandles: trendingCandles(200, -2),
    ethCandles: trendingCandles(300, -3),
  });

  assert.equal(bull.direction, "bull");
  assert.equal(bear.direction, "bear");

  for (const regime of [bull, bear]) {
    assert.equal(Array.isArray(regime.reasons), true);
    assert.equal(regime.reasons.length > 0, true);
    assert.equal(regime.reasons.some((reason) => /[가-힣]/.test(reason)), true);
  }
});

test("scanner caps concurrency, normalizes duplicates, limits symbols, and reports progress", async () => {
  let active = 0;
  let peak = 0;
  const progress = [];
  const service = createScannerService({
    concurrency: 2,
    maxSymbols: 3,
    bybit: {
      fetchCandles: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return trendingCandles(100, 2);
      },
    },
  });

  const candidates = await service.run({
    symbols: [" btc ", "BTCUSDT", "eth", "sol", "xrp"],
    onProgress: (value) => progress.push(value),
  });

  assert.equal(peak, 2);
  assert.deepEqual(
    candidates.map((candidate) => candidate.symbol),
    ["BTC", "ETH", "SOL"],
  );
  assert.deepEqual(
    progress.map(({ completed, total }) => [completed, total]),
    [
      [1, 3],
      [2, 3],
      [3, 3],
    ],
  );
});

test("scanner rejects duplicate runs and supports AbortSignal cancellation", async () => {
  const gate = deferred();
  const service = createScannerService({
    concurrency: 1,
    bybit: { fetchCandles: () => gate.promise },
  });
  const controller = new AbortController();
  const pending = service.run({ symbols: ["btc", "eth"], signal: controller.signal });

  await assert.rejects(service.run({ symbols: ["sol"] }), /already running/i);
  controller.abort();
  gate.resolve(trendingCandles(100, 2));
  await assert.rejects(pending, (error) => error.name === "AbortError");
});

test("scanner remains running until every in-flight request settles after abort", async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const service = createScannerService({
    concurrency: 2,
    bybit: {
      fetchCandles: () => (calls++ === 0 ? first.promise : second.promise),
    },
  });
  const controller = new AbortController();
  const pending = service.run({ symbols: ["btc", "eth"], signal: controller.signal });
  let aborted = false;
  pending.catch(() => {
    aborted = true;
  });

  controller.abort();
  first.resolve(trendingCandles(100, 2));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(aborted, false);
  await assert.rejects(service.run({ symbols: ["sol"] }), /already running/i);
  second.resolve(trendingCandles(100, 2));
  await assert.rejects(pending, (error) => error.name === "AbortError");
});

test("scanner isolates failed symbols as safe diagnostic candidates", async () => {
  const service = createScannerService({
    bybit: {
      fetchCandles: async (symbol) => {
        if (symbol === "ETH") {
          throw new Error("secret upstream response");
        }
        return trendingCandles(100, 2);
      },
    },
  });

  const candidates = await service.run({ symbols: ["btc", "eth", "sol"] });
  const failed = candidates.find(({ symbol }) => symbol === "ETH");

  assert.equal(candidates.length, 3);
  assert.equal(failed.status, "error");
  assert.equal(failed.diagnostics.length, 1);
  assert.equal(JSON.stringify(failed.diagnostics).includes("secret upstream"), false);
});
