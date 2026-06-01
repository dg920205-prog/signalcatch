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
