import assert from "node:assert/strict";
import test from "node:test";

import { analyzeMarketRegime } from "../js/analysis/market-regime.js";
import { TREND_STATES } from "../js/analysis/trend-gating.js";
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

test("manual asset merges concurrent refresh promises", async () => {
  const first = deferred();
  let refreshCount = 0;
  const service = createManualAssetService(
    adapters({
      bybit: {
        fetchTicker: async (symbol) => {
          refreshCount += 1;

          if (refreshCount === 1) {
            return { symbol: `${symbol}USDT`, price: 1 };
          }

          return first.promise;
        },
      },
    }),
  );
  const added = await service.add({ symbol: "btc", exchange: "bybit" });
  const firstRefresh = service.refresh(added.id);
  const secondRefresh = service.refresh(added.id);

  first.resolve({ symbol: "BTCUSDT", price: 2 });
  await Promise.all([firstRefresh, secondRefresh]);

  assert.equal(refreshCount, 2);
  assert.equal(service.list()[0].ticker.price, 2);
});

test("manual asset does not return or restore a removed card after pending load", async () => {
  const candles = deferred();
  const service = createManualAssetService(
    adapters({ bybit: { fetchCandles: () => candles.promise } }),
  );
  const pending = service.add({ symbol: "btc", exchange: "bybit" });
  const { id } = service.list()[0];

  assert.equal(service.remove(id), true);
  candles.resolve(trendingCandles(100, 2));

  const result = await pending;

  assert.equal(service.list().length, 0);
  assert.equal(result === null || ["removed", "stale"].includes(result.status), true);
});

test("manual asset detaches removed in-flight requests before re-adding the same id", async () => {
  const oldTicker = deferred();
  const oldCandles = deferred();
  const newTicker = deferred();
  const newCandles = deferred();
  let tickerCalls = 0;
  let candleCalls = 0;
  const service = createManualAssetService(
    adapters({
      bybit: {
        fetchTicker: async () => {
          tickerCalls += 1;
          return tickerCalls === 1 ? oldTicker.promise : newTicker.promise;
        },
        fetchCandles: async () => {
          candleCalls += 1;
          return candleCalls === 1 ? oldCandles.promise : newCandles.promise;
        },
      },
    }),
  );
  const oldPending = service.add({ symbol: "btc", exchange: "bybit" });
  const { id } = service.list()[0];

  assert.equal(service.remove(id), true);

  const newPending = service.add({ symbol: "btc", exchange: "bybit" });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(tickerCalls, 2);
  assert.equal(candleCalls, 2);

  oldTicker.resolve({ symbol: "BTCUSDT", price: 1 });
  oldCandles.resolve(trendingCandles(100, 1));
  assert.equal(await oldPending, null);

  newTicker.resolve({ symbol: "BTCUSDT", price: 2 });
  newCandles.resolve(trendingCandles(100, 2));
  const asset = await newPending;

  assert.equal(asset.status, "ready");
  assert.equal(asset.ticker.price, 2);
  assert.equal(service.list()[0].status, "ready");
  assert.equal(service.list()[0].ticker.price, 2);
});

test("manual asset converts synchronous adapter throws into diagnostics", async () => {
  const service = createManualAssetService(
    adapters({
      bybit: {
        fetchTicker() {
          throw new Error("private sync ticker failure");
        },
        fetchCandles() {
          throw new Error("private sync candle failure");
        },
      },
    }),
  );

  const asset = await service.add({ symbol: "btc", exchange: "bybit" });

  assert.equal(asset.status, "error");
  assert.equal(asset.diagnostics.length, 2);
});

test("manual asset diagnostics tolerate throwing detail getters and proxies", async () => {
  const getterError = new Error("private getter failure");
  Object.defineProperty(getterError, "detail", {
    get() {
      throw new Error("private detail getter");
    },
  });
  const proxyError = new Error("private proxy failure");
  proxyError.detail = new Proxy(
    {},
    {
      get() {
        throw new Error("private proxy getter");
      },
    },
  );
  let calls = 0;
  const service = createManualAssetService(
    adapters({
      bybit: {
        fetchTicker: async () => {
          throw calls++ === 0 ? getterError : proxyError;
        },
      },
    }),
  );

  const first = await service.add({ symbol: "btc", exchange: "bybit" });
  const second = await service.add({ symbol: "eth", exchange: "bybit" });

  assert.equal(first.status, "error");
  assert.equal(second.status, "error");
  assert.equal(first.error, "Some asset data could not be loaded.");
  assert.equal(second.error, "Some asset data could not be loaded.");
});

test("manual asset merges repeated refresh calls while a request is in flight", async () => {
  const ticker = deferred();
  const candles = deferred();
  let tickerCalls = 0;
  let candleCalls = 0;
  const service = createManualAssetService(
    adapters({
      bybit: {
        fetchTicker: async () => {
          tickerCalls += 1;
          return ticker.promise;
        },
        fetchCandles: async () => {
          candleCalls += 1;
          return candles.promise;
        },
      },
    }),
  );
  const pending = service.add({ symbol: "btc", exchange: "bybit" });
  const { id } = service.list()[0];
  const refreshes = Array.from({ length: 100 }, () => service.refresh(id));

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(tickerCalls, 1);
  assert.equal(candleCalls, 1);

  ticker.resolve({ symbol: "BTCUSDT", price: 1 });
  candles.resolve(trendingCandles(100, 2));
  await Promise.all([pending, ...refreshes]);
});

test("manual asset keeps a visible error card when its adapter is missing", async () => {
  const service = createManualAssetService({});

  const asset = await service.add({ symbol: "btc", exchange: "bybit" });

  assert.equal(asset.visible, true);
  assert.equal(asset.status, "error");
  assert.equal(asset.error, "Some asset data could not be loaded.");
  assert.equal(asset.diagnostics.length, 1);
  assert.equal(service.list()[0].status, "error");

  const refreshed = await service.refresh(asset.id);

  assert.equal(refreshed.status, "error");
  assert.equal(refreshed.error, "Some asset data could not be loaded.");
});

test("market regime is neutral with insufficient data", () => {
  const regime = analyzeMarketRegime({ btcCandles: [], ethCandles: [] });

  assert.equal(regime.direction, "neutral");
  assert.equal(Array.isArray(regime.reasons), true);
  assert.equal(regime.reasons.length > 0, true);
  assert.match(regime.reasons.join(" "), /캔들이 부족/);
  assert.doesNotMatch(regime.reasons.join(" "), /일치하지/);
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

test("market regime explains actual BTC and ETH direction mismatches", () => {
  const regime = analyzeMarketRegime({
    btcCandles: trendingCandles(100, 2),
    ethCandles: trendingCandles(300, -3),
  });

  assert.equal(regime.direction, "neutral");
  assert.equal(
    regime.reasons.includes("BTC와 ETH 방향이 일치하지 않습니다."),
    true,
  );
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
    ["BTC", "ETH"],
  );
  assert.deepEqual(
    progress.map(({ completed, total }) => [completed, total]),
    [
      [1, 2],
      [2, 2],
    ],
  );
});

test("scanner builds current position setups for every timeframe", async () => {
  const requestedModes = [];
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "HBARUSDT", price: 0.18 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async (symbol, mode) => {
        requestedModes.push([symbol, mode]);
        return trendingCandles(100, 2);
      },
    },
  });

  const [candidate] = await service.run({ symbols: ["HBAR"] });

  assert.equal(candidate.price, 0.18);
  assert.deepEqual(requestedModes, MODES.map((mode) => ["HBAR", mode]));
  assert.deepEqual(Object.keys(candidate.setups), MODES);
  for (const mode of MODES) {
    assert.equal(candidate.setups[mode].mode, mode);
    assert.equal(candidate.setups[mode].direction, "bull");
    assert.ok(candidate.setups[mode].plan);
    assert.equal(typeof candidate.setups[mode].recommendation.label, "string");
  }
  assert.ok(candidate.setups.daily.recommendation.split);
  assert.ok(candidate.setups.swing.recommendation.split);
});

test("scanner rejects unsafe concurrency fanout", () => {
  assert.throws(
    () =>
      createScannerService({
        concurrency: 999999,
        bybit: { fetchCandles: async () => trendingCandles(100, 2) },
      }),
    /configuration/i,
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
  assert.equal(failed.error, "Some scanner data could not be loaded.");
  assert.equal(failed.diagnostics.length, 1);
  assert.equal(JSON.stringify(failed.diagnostics).includes("secret upstream"), false);
});

test("scanner converts synchronous adapter throws into diagnostics", async () => {
  const service = createScannerService({
    bybit: {
      fetchCandles() {
        throw new Error("private sync scanner failure");
      },
    },
  });

  const [candidate] = await service.run({ symbols: ["btc"] });

  assert.equal(candidate.status, "error");
  assert.equal(candidate.error, "Some scanner data could not be loaded.");
  assert.equal(candidate.diagnostics.length, 1);
});

test("scanner limits symbol reads and skips sparse entries", async () => {
  const symbols = [];
  symbols.length = 1_000_000;
  symbols[0] = "btc";
  symbols[1] = "eth";
  Object.defineProperty(symbols, 2, {
    get() {
      throw new Error("scanner read beyond maxSymbols");
    },
  });
  const service = createScannerService({
    maxSymbols: 2,
    bybit: { fetchCandles: async () => trendingCandles(100, 2) },
  });

  const candidates = await service.run({ symbols });

  assert.deepEqual(
    candidates.map(({ symbol }) => symbol),
    ["BTC", "ETH"],
  );
});

test("scanner isolates hostile symbol getters within the inspection limit", async () => {
  const symbols = ["btc", "eth", "sol"];
  Object.defineProperty(symbols, 1, {
    get() {
      throw new Error("hostile symbol getter");
    },
  });
  const service = createScannerService({
    maxSymbols: 3,
    bybit: { fetchCandles: async () => trendingCandles(100, 2) },
  });

  const candidates = await service.run({ symbols });

  assert.deepEqual(
    candidates.map(({ symbol }) => symbol),
    ["BTC", "SOL"],
  );
});

test("scanner rejects unsafe symbols collections and maxSymbols values", async () => {
  const bybit = { fetchCandles: async () => trendingCandles(100, 2) };

  await assert.rejects(
    createScannerService({ bybit }).run({ symbols: { 0: "btc", length: 1 } }),
    /symbols/i,
  );
  assert.throws(
    () => createScannerService({ bybit, maxSymbols: 501 }),
    /configuration/i,
  );
});

test("scanner isolates progress callback failures and continues scanning", async () => {
  const service = createScannerService({
    bybit: { fetchCandles: async () => trendingCandles(100, 2) },
  });

  const candidates = await service.run({
    symbols: ["btc", "eth"],
    onProgress() {
      throw new Error("consumer progress failure");
    },
  });

  assert.deepEqual(
    candidates.map(({ symbol }) => symbol),
    ["BTC", "ETH"],
  );
});

test("scanner diagnostics tolerate throwing detail getters and proxies", async () => {
  const errors = [
    Object.defineProperty(new Error("private getter failure"), "detail", {
      get() {
        throw new Error("private detail getter");
      },
    }),
    Object.assign(new Error("private proxy failure"), {
      detail: new Proxy(
        {},
        {
          get() {
            throw new Error("private proxy getter");
          },
        },
      ),
    }),
  ];
  let calls = 0;
  const service = createScannerService({
    bybit: {
      fetchCandles: async () => {
        throw errors[calls++];
      },
    },
  });

  const candidates = await service.run({ symbols: ["btc", "eth"] });

  assert.deepEqual(
    candidates.map(({ status }) => status),
    ["error", "error"],
  );
  assert.equal(
    JSON.stringify(candidates).includes("private"),
    false,
  );
});

function htfTrendingCandles(direction, count = 600) {
  const candles = [];
  let price = 10000;
  const step = direction === "up" ? 8 : direction === "down" ? -8 : 0;
  for (let i = 0; i < count; i += 1) {
    const open = price;
    const close = price + step;
    const high = Math.max(open, close) + 2;
    const low = Math.min(open, close) - 2;
    candles.push({ open, high, low, close, volume: 1000 });
    price = close;
  }
  return candles;
}

test("scanner skips trend gating when fetchHtfCandles not provided", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "BTCUSDT", price: 100 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
    },
  });
  const [candidate] = await service.run({ symbols: ["BTC"] });
  assert.equal(candidate.setups.common.trendGating, null);
});

test("scanner applies trend gating when fetchHtfCandles provided", async () => {
  const htfCalls = [];
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "ETHUSDT", price: 2000 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
      fetchHtfCandles: async (symbol, htfInterval) => {
        htfCalls.push([symbol, htfInterval]);
        return htfTrendingCandles("up", 600);
      },
    },
  });
  const [candidate] = await service.run({ symbols: ["ETH"] });
  assert.ok(candidate.setups.common.trendGating);
  assert.equal(typeof candidate.setups.common.trendGating.state, "string");
  assert.equal(typeof candidate.setups.common.trendGating.multiplier, "number");
  const symbolsFetched = htfCalls.map(([symbol]) => symbol);
  assert.ok(symbolsFetched.includes("BTC"));
});

test("scanner caches HTF candles per symbol across modes sharing same htfInterval", async () => {
  const htfCalls = [];
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "SOLUSDT", price: 100 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
      fetchHtfCandles: async (symbol, htfInterval) => {
        htfCalls.push([symbol, htfInterval]);
        return htfTrendingCandles("up", 600);
      },
    },
  });
  await service.run({ symbols: ["SOL"] });
  const solCalls = htfCalls.filter(([symbol]) => symbol === "SOL");
  assert.equal(solCalls.length, 3);
});

test("scanner survives BTC HTF pre-fetch failure", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "ETHUSDT", price: 2000 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
      fetchHtfCandles: async (symbol) => {
        if (symbol === "BTC") {
          throw new Error("BTC fetch failed");
        }
        return htfTrendingCandles("up", 600);
      },
    },
  });
  const [candidate] = await service.run({ symbols: ["ETH"] });
  assert.equal(candidate.status, "ready");
  assert.ok(candidate.setups.common.trendGating);
  assert.equal(candidate.setups.common.trendGating.btcOverlayApplied, false);
});

test("scanner survives per-mode HTF fetch failure", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "ADAUSDT", price: 0.5 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
      fetchHtfCandles: async (symbol) => {
        if (symbol === "ADA") {
          throw new Error("ADA HTF fetch failed");
        }
        return htfTrendingCandles("up", 600);
      },
    },
  });
  const [candidate] = await service.run({ symbols: ["ADA"] });
  assert.equal(candidate.status, "ready");
  assert.equal(candidate.setups.common.trendGating.state, "insufficient_data");
  assert.equal(candidate.setups.common.trendGating.multiplier, 1.0);
});

test("scanner does not apply BTC overlay for BTC symbol itself", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "BTCUSDT", price: 50000 }),
      fetchCandles: async () => trendingCandles(100, -2),
      fetchModeCandles: async () => trendingCandles(100, -2),
      fetchHtfCandles: async () => htfTrendingCandles("down", 600),
    },
  });
  const [candidate] = await service.run({ symbols: ["BTC"] });
  for (const mode of MODES) {
    assert.equal(
      candidate.setups[mode].trendGating.btcOverlayApplied,
      false,
      `BTC ${mode} should not have BTC overlay applied`,
    );
  }
});

test("scanner sets structureGating to null when fetchHtfCandles not provided", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "BTCUSDT", price: 100 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
    },
  });
  const [candidate] = await service.run({ symbols: ["BTC"] });
  assert.equal(candidate.setups.common.structureGating, null);
});

test("scanner populates structureGating when fetchHtfCandles provided", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "ETHUSDT", price: 2000 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
      fetchHtfCandles: async () => htfTrendingCandles("up", 600),
    },
  });
  const [candidate] = await service.run({ symbols: ["ETH"] });
  assert.ok(candidate.setups.common.structureGating);
  assert.equal(typeof candidate.setups.common.structureGating.state, "string");
  assert.equal(typeof candidate.setups.common.structureGating.multiplier, "number");
});

test("scanner structure detection reuses cached HTF candles (no extra fetches)", async () => {
  const htfCalls = [];
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "SOLUSDT", price: 100 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
      fetchHtfCandles: async (symbol, htfInterval) => {
        htfCalls.push([symbol, htfInterval]);
        return htfTrendingCandles("up", 600);
      },
    },
  });
  await service.run({ symbols: ["SOL"] });
  const solCalls = htfCalls.filter(([symbol]) => symbol === "SOL");
  assert.equal(solCalls.length, 3);
  const [candidate] = await service.run({ symbols: ["SOL"] });
  for (const mode of MODES) {
    assert.ok(
      candidate.setups[mode].structureGating,
      `${mode} should have structureGating populated`,
    );
  }
});

test("scanner applies compound multiplier (trend × structure) to final score", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "ETHUSDT", price: 2000 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
      fetchHtfCandles: async () => htfTrendingCandles("up", 600),
    },
  });
  const [candidate] = await service.run({ symbols: ["ETH"] });
  const setup = candidate.setups.common;
  assert.equal(typeof setup.trendGating.multiplier, "number");
  assert.equal(typeof setup.structureGating.multiplier, "number");
  assert.equal(typeof setup.analysis.score, "number");
  const combined = setup.trendGating.multiplier * setup.structureGating.multiplier;
  assert.notEqual(combined, 1.0, "Compound multiplier should not equal 1.0 in strong uptrend");
});

test("scanner sets cvdGating to null when fetchHtfCandles not provided", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "BTCUSDT", price: 100 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
    },
  });
  const [candidate] = await service.run({ symbols: ["BTC"] });
  assert.equal(candidate.setups.common.cvdGating, null);
});

test("scanner populates cvdGating when fetchHtfCandles provided", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "ETHUSDT", price: 2000 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
      fetchHtfCandles: async () => htfTrendingCandles("up", 600),
    },
  });
  const [candidate] = await service.run({ symbols: ["ETH"] });
  assert.ok(candidate.setups.common.cvdGating);
  assert.equal(typeof candidate.setups.common.cvdGating.state, "string");
  assert.equal(typeof candidate.setups.common.cvdGating.multiplier, "number");
});

test("scanner CVD detection reuses cached HTF candles (no extra fetches)", async () => {
  const htfCalls = [];
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "SOLUSDT", price: 100 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
      fetchHtfCandles: async (symbol, htfInterval) => {
        htfCalls.push([symbol, htfInterval]);
        return htfTrendingCandles("up", 600);
      },
    },
  });
  await service.run({ symbols: ["SOL"] });
  const solCalls = htfCalls.filter(([symbol]) => symbol === "SOL");
  assert.equal(solCalls.length, 3);
});

test("scanner applies 3-layer compound multiplier (trend × structure × cvd)", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "ETHUSDT", price: 2000 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
      fetchHtfCandles: async () => htfTrendingCandles("up", 600),
    },
  });
  const [candidate] = await service.run({ symbols: ["ETH"] });
  const setup = candidate.setups.common;
  assert.equal(typeof setup.trendGating.multiplier, "number");
  assert.equal(typeof setup.structureGating.multiplier, "number");
  assert.equal(typeof setup.cvdGating.multiplier, "number");
  const combined =
    setup.trendGating.multiplier *
    setup.structureGating.multiplier *
    setup.cvdGating.multiplier;
  assert.ok(Number.isFinite(combined));
  assert.ok(combined > 0, "combined multiplier should be positive");
});

function zoneCandles() {
  const c = (o, h, l, cl, v = 100) => ({ open: o, high: h, low: l, close: cl, volume: v });
  const arr = [];
  for (let i = 0; i < 30; i += 1) {
    const base = 200 - i;
    arr.push(c(base, base + 1, base - 1, base - 0.5, 100));
  }
  arr.push(c(170, 171, 160, 161));
  arr.push(c(161, 162, 158, 159));
  arr.push(c(159, 160, 150, 151));
  arr.push(c(151, 155, 151, 154));
  arr.push(c(154, 158, 153, 157));
  arr.push(c(157, 159, 145, 156));
  arr.push(c(158, 158, 154, 155));
  arr.push(c(155, 173, 155, 172, 800));
  arr.push(c(172, 176, 168, 174));
  arr.push(c(174, 180, 172, 178));
  arr.push(c(178, 184, 176, 182));
  for (let i = 0; i < 10; i += 1) {
    const base = 184 + i;
    arr.push(c(base, base + 1, base - 1, base + 0.5, 100));
  }
  return arr;
}

test("scanner keeps close-based plan when fetchZoneCandles absent", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "ETHUSDT", price: 2000 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
      fetchHtfCandles: async () => htfTrendingCandles("up", 600),
    },
  });
  const [candidate] = await service.run({ symbols: ["ETH"] });
  assert.equal(candidate.setups.common.ictPlan ?? null, null);
  assert.ok(candidate.setups.common.plan);
});

test("scanner produces ICT zone-based plan when fetchZoneCandles provided", async () => {
  const zc = zoneCandles();
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "ETHUSDT", price: 190 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
      fetchHtfCandles: async () => htfTrendingCandles("up", 600),
      fetchZoneCandles: async () => zc,
    },
  });
  const [candidate] = await service.run({ symbols: ["ETH"] });
  const setup = candidate.setups.common;
  assert.ok(setup.ictPlan, "expected ictPlan present");
  assert.ok(
    setup.ictPlan.status === "ready" || setup.ictPlan.status === "waiting",
    `unexpected status ${setup.ictPlan.status}`,
  );
  assert.equal(setup.plan, setup.ictPlan);
});

test("scanner zone fetch reuses cache across modes with same zoneInterval", async () => {
  const zoneCalls = [];
  const zc = zoneCandles();
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "SOLUSDT", price: 190 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
      fetchHtfCandles: async () => htfTrendingCandles("up", 600),
      fetchZoneCandles: async (symbol, zoneInterval) => {
        zoneCalls.push([symbol, zoneInterval]);
        return zc;
      },
    },
  });
  await service.run({ symbols: ["SOL"] });
  const solZoneCalls = zoneCalls.filter(([s]) => s === "SOL");
  const uniqueIntervals = new Set(solZoneCalls.map(([, iv]) => iv));
  assert.equal(uniqueIntervals.size, 3);
});

test("scanner survives zone fetch failure (plan waiting, scan continues)", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "ADAUSDT", price: 0.5 }),
      fetchCandles: async () => trendingCandles(100, 2),
      fetchModeCandles: async () => trendingCandles(100, 2),
      fetchHtfCandles: async () => htfTrendingCandles("up", 600),
      fetchZoneCandles: async () => { throw new Error("zone fetch failed"); },
    },
  });
  const [candidate] = await service.run({ symbols: ["ADA"] });
  assert.equal(candidate.status, "ready");
  assert.ok(candidate.setups.common.ictPlan);
  assert.equal(candidate.setups.common.ictPlan.status, "waiting");
});
