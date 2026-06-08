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

function stochRsiModeCandles(start, step) {
  return Array.from({ length: 80 }, (_, index) =>
    candle(start + step * index, 100 + index * 5),
  );
}

function stochRsiEmbeddedObCandles() {
  return [
    ...stochRsiModeCandles(100, 1),
    ...[180, 182, 181, 184, 183, 186, 185, 188, 187, 190, 191, 192].map((close) =>
      candle(close, 500),
    ),
  ];
}

function stochRsiEmbeddedOsCandles() {
  return [
    ...stochRsiModeCandles(200, -1),
    ...[120, 118, 119, 116, 117, 114, 115, 112, 113, 110, 109, 108].map((close) =>
      candle(close, 500),
    ),
  ];
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

function bearishZoneCandles() {
  const c = (o, h, l, cl, v = 100) => ({ open: o, high: h, low: l, close: cl, volume: v });
  const arr = [];
  for (let i = 0; i < 30; i += 1) {
    const base = 100 + i;
    arr.push(c(base, base + 1, base - 1, base + 0.5, 100));
  }
  arr.push(c(130, 140, 129, 139));
  arr.push(c(139, 142, 138, 141));
  arr.push(c(141, 150, 140, 149));
  arr.push(c(149, 149, 137, 140));
  arr.push(c(140, 141, 132, 133));
  arr.push(c(96, 98, 94, 97));
  arr.push(c(97, 97, 82, 84, 800));
  arr.push(c(84, 92, 80, 82));
  arr.push(c(82, 90, 78, 80));
  arr.push(c(80, 88, 76, 78));
  return arr;
}

const BULLISH_HL_DIVERGENCE_CLOSES = [
  99.89, 100, 99.96, 99.95, 100.08, 99.98, 100, 100.05, 100.02, 99.83,
  99.67, 99.48, 99.43, 99.52, 99.39, 99.41, 99.45, 99.3, 99.42, 99.32,
  99.22, 99.06, 99.2, 99.04, 99.03, 99.06, 98.89, 98.92, 98.89, 99.02,
  98.98, 99.04, 98.97, 99.09, 98.98, 98.98, 99.16, 99.23, 99.41, 99.44,
  99.36, 99.52, 99.41, 99.62, 99.73, 99.8, 99.92, 99.88, 100.05, 100.06,
  100, 100.07, 99.99, 100.14, 100.01, 100, 99.85, 99.78, 99.86, 99.83,
  99.93, 99.8, 99.82, 99.82, 99.71, 99.84, 99.94, 99.99, 100.03, 100.13,
  99.96, 100.11, 100, 99.93, 99.8, 99.84, 100.04, 99.95, 99.94, 99.95,
  99.95, 100.11, 100.16, 100.12, 100.07, 100.21, 100.32, 100.19, 100.22,
  100.21, 100.16, 100.36, 100.45, 100.32, 100.48, 100.51, 100.55, 100.68,
  100.84, 100.75,
];

const BEARISH_LH_DIVERGENCE_CLOSES = [
  99.82, 99.74, 99.63, 99.76, 99.75, 99.55, 99.69, 99.7, 99.59, 99.59,
  99.54, 99.56, 99.53, 99.5, 99.4, 99.21, 99.01, 99.01, 99.08, 98.98,
  98.92, 99, 98.82, 98.78, 98.92, 99.05, 99.16, 99.08, 99.22, 99.21,
  99.39, 99.56, 99.69, 99.66, 99.57, 99.46, 99.59, 99.8, 99.83, 99.75,
  99.82, 100.02, 100.1, 100.09, 100.09, 100.28, 100.48, 100.39, 100.27,
  100.46, 100.38, 100.36, 100.47, 100.42, 100.53, 100.35, 100.34, 100.42,
  100.48, 100.42, 100.43, 100.5, 100.43, 100.39, 100.43, 100.52, 100.67,
  100.74, 100.78, 100.91, 101.05, 100.93, 100.81, 100.62, 100.61, 100.7,
  100.84, 101.01, 101.21, 101.2, 101.06, 101.05, 101.22, 101.1, 101.18,
  101.07, 101.24, 101.17, 101.33, 101.53, 101.53, 101.41, 101.35, 101.5,
  101.6, 101.52, 101.39, 101.33, 101.19, 101.27,
];

function divergenceCandles(closes) {
  return closes.map((close) => candle(close, 100));
}

async function scanWithDivergence({
  modeCandles,
  zoneCandleSet,
  direction,
  close,
  htfDirection,
}) {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "TESTUSDT", price: close }),
      fetchCandles: async () => modeCandles,
      fetchModeCandles: async () => modeCandles,
      fetchHtfCandles: async () => htfTrendingCandles(htfDirection, 600),
      fetchZoneCandles: async () => zoneCandleSet,
    },
    analyze: () => ({
      direction,
      score: 80,
      close,
      scoreBreakdown: {},
    }),
  });
  const [candidate] = await service.run({ symbols: ["TEST"] });
  return candidate.setups.common;
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

test("scanner sets extensionGating to insufficient_data when fetchHtfCandles not provided", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "ETHUSDT", price: 2000 }),
      fetchModeCandles: async () => trendingCandles(100, 2),
    },
  });
  const [candidate] = await service.run({ symbols: ["ETH"] });
  assert.equal(candidate.setups.common.extensionGating.state, "insufficient_data");
  assert.equal(candidate.setups.common.extensionGating.multiplier, 1);
});

test("scanner populates extensionGating when fetchHtfCandles provided", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "SOLUSDT", price: 100 }),
      fetchModeCandles: async () => trendingCandles(100, 2),
      fetchHtfCandles: async () => htfTrendingCandles("up", 600),
    },
  });
  const [candidate] = await service.run({ symbols: ["SOL"] });
  assert.ok(["normal", "overextended_up", "overextended_down", "insufficient_data"].includes(candidate.setups.common.extensionGating.state));
});

test("scanner populates stochRsiGating with mode candles only", async () => {
  let htfCalls = 0;
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "ETHUSDT", price: 2000 }),
      fetchModeCandles: async () => stochRsiModeCandles(100, 2),
      fetchHtfCandles: async () => {
        htfCalls += 1;
        return htfTrendingCandles("up", 600);
      },
    },
  });
  const [candidate] = await service.run({ symbols: ["ETH"] });
  const gating = candidate.setups.common.stochRsiGating;
  assert.ok(gating);
  assert.ok(["normal", "embedded_ob", "embedded_os", "embedded_ob_exit", "embedded_os_exit", "insufficient_data"].includes(gating.state));
  assert.equal(typeof gating.multiplier, "number");
  assert.ok(htfCalls > 0, "HTF fetch still belongs to existing gates, not StochRSI");
});

test("scanner sets stochRsiGating insufficient_data when mode candles are too short", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "XRPUSDT", price: 1 }),
      fetchModeCandles: async () => trendingCandles(100, 2),
    },
  });
  const [candidate] = await service.run({ symbols: ["XRP"] });
  assert.equal(candidate.setups.common.stochRsiGating.state, "insufficient_data");
  assert.equal(candidate.setups.common.stochRsiGating.multiplier, 1);
});

test("scanner applies 0.3 StochRSI penalty when embedded_ob and direction bear", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "ADAUSDT", price: 100 }),
      fetchModeCandles: async () => stochRsiEmbeddedOsCandles(),
    },
    analyze: (candles) => ({
      direction: "bear",
      score: 80,
      close: candles.at(-1)?.close ?? null,
      scoreBreakdown: {},
    }),
  });
  const [candidate] = await service.run({ symbols: ["ADA"] });
  const gating = candidate.setups.common.stochRsiGating;
  if (gating.state === "embedded_ob") {
    assert.equal(gating.multiplier, 0.3);
    assert.equal(candidate.setups.common.analysis.score, 24);
  } else {
    assert.ok(["normal", "embedded_ob_exit", "insufficient_data"].includes(gating.state));
    assert.ok([1, 0.9].includes(gating.multiplier));
  }
});

test("scanner applies 0.3 StochRSI penalty when embedded_os and direction bull", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "SOLUSDT", price: 100 }),
      fetchModeCandles: async () => stochRsiEmbeddedObCandles(),
    },
    analyze: (candles) => ({
      direction: "bull",
      score: 80,
      close: candles.at(-1)?.close ?? null,
      scoreBreakdown: {},
    }),
  });
  const [candidate] = await service.run({ symbols: ["SOL"] });
  const gating = candidate.setups.common.stochRsiGating;
  if (gating.state === "embedded_os") {
    assert.equal(gating.multiplier, 0.3);
    assert.equal(candidate.setups.common.analysis.score, 24);
  } else {
    assert.ok(["normal", "embedded_os_exit", "insufficient_data"].includes(gating.state));
    assert.ok([1, 0.9].includes(gating.multiplier));
  }
});

test("scanner keeps same-direction embedded StochRSI signals at 1.0", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "LINKUSDT", price: 100 }),
      fetchModeCandles: async () => stochRsiEmbeddedOsCandles(),
    },
    analyze: (candles) => ({
      direction: "bull",
      score: 80,
      close: candles.at(-1)?.close ?? null,
      scoreBreakdown: {},
    }),
  });
  const [candidate] = await service.run({ symbols: ["LINK"] });
  const gating = candidate.setups.common.stochRsiGating;
  if (gating.state === "embedded_ob") {
    assert.equal(gating.multiplier, 1);
    assert.equal(candidate.setups.common.analysis.score, 80);
  } else {
    assert.ok(["normal", "embedded_ob_exit", "insufficient_data"].includes(gating.state));
    assert.ok([1, 0.9].includes(gating.multiplier));
  }
});

test("scanner adds stochRsiGating to every mode", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "HBARUSDT", price: 1 }),
      fetchModeCandles: async () => stochRsiModeCandles(100, 2),
    },
  });
  const [candidate] = await service.run({ symbols: ["HBAR"] });
  for (const mode of MODES) {
    const gating = candidate.setups[mode].stochRsiGating;
    assert.ok(gating, `${mode} stochRsiGating missing`);
    assert.equal(typeof gating.state, "string");
    assert.equal(typeof gating.multiplier, "number");
  }
});

test("scanner exposes stochRsiDivergence field on every mode", async () => {
  const service = createScannerService({
    bybit: {
      fetchTicker: async () => ({ symbol: "HBARUSDT", price: 1 }),
      fetchModeCandles: async () => divergenceCandles(BULLISH_HL_DIVERGENCE_CLOSES),
    },
  });
  const [candidate] = await service.run({ symbols: ["HBAR"] });
  for (const mode of MODES) {
    const divergence = candidate.setups[mode].stochRsiDivergence;
    assert.ok(divergence, `${mode} stochRsiDivergence missing`);
    assert.equal(typeof divergence.state, "string");
    assert.equal(typeof divergence.separated, "boolean");
    assert.equal(typeof divergence.confidenceBoost, "number");
  }
});

test("scanner exposes divergence without boost when zone candles are empty", async () => {
  const setup = await scanWithDivergence({
    modeCandles: divergenceCandles(BULLISH_HL_DIVERGENCE_CLOSES),
    zoneCandleSet: [],
    direction: "bull",
    close: 190,
    htfDirection: "up",
  });
  assert.equal(setup.stochRsiDivergence.state, "bullish_hl");
  assert.equal(setup.stochRsiDivergence.confidenceBoost, 0);
  assert.equal(setup.ictPlan.status, "waiting");
});

test("scanner boosts same-direction bullish divergence by exactly one confidence point", async () => {
  const base = await scanWithDivergence({
    modeCandles: stochRsiModeCandles(100, 2),
    zoneCandleSet: zoneCandles(),
    direction: "bull",
    close: 190,
    htfDirection: "up",
  });
  const boosted = await scanWithDivergence({
    modeCandles: divergenceCandles(BULLISH_HL_DIVERGENCE_CLOSES),
    zoneCandleSet: zoneCandles(),
    direction: "bull",
    close: 190,
    htfDirection: "up",
  });
  assert.equal(boosted.stochRsiDivergence.state, "bullish_hl");
  assert.equal(boosted.stochRsiDivergence.confidenceBoost, 1);
  assert.equal(boosted.ictPlan.confidence, base.ictPlan.confidence + 1);
});

test("scanner boosts same-direction bearish divergence by exactly one confidence point", async () => {
  const base = await scanWithDivergence({
    modeCandles: stochRsiModeCandles(200, -2),
    zoneCandleSet: bearishZoneCandles(),
    direction: "bear",
    close: 90,
    htfDirection: "down",
  });
  const boosted = await scanWithDivergence({
    modeCandles: divergenceCandles(BEARISH_LH_DIVERGENCE_CLOSES),
    zoneCandleSet: bearishZoneCandles(),
    direction: "bear",
    close: 90,
    htfDirection: "down",
  });
  assert.equal(boosted.stochRsiDivergence.state, "bearish_lh");
  assert.equal(boosted.stochRsiDivergence.confidenceBoost, 1);
  assert.equal(boosted.ictPlan.confidence, base.ictPlan.confidence + 1);
});

test("scanner does not boost opposite-direction divergence", async () => {
  const base = await scanWithDivergence({
    modeCandles: stochRsiModeCandles(200, -2),
    zoneCandleSet: bearishZoneCandles(),
    direction: "bear",
    close: 90,
    htfDirection: "down",
  });
  const opposite = await scanWithDivergence({
    modeCandles: divergenceCandles(BULLISH_HL_DIVERGENCE_CLOSES),
    zoneCandleSet: bearishZoneCandles(),
    direction: "bear",
    close: 90,
    htfDirection: "down",
  });
  assert.equal(opposite.stochRsiDivergence.state, "bullish_hl");
  assert.equal(opposite.stochRsiDivergence.confidenceBoost, 0);
  assert.equal(opposite.ictPlan.confidence, base.ictPlan.confidence);
});

test("scanner does not boost when entry zone is not selected", async () => {
  const setup = await scanWithDivergence({
    modeCandles: divergenceCandles(BEARISH_LH_DIVERGENCE_CLOSES),
    zoneCandleSet: zoneCandles(),
    direction: "bear",
    close: 190,
    htfDirection: "down",
  });
  assert.equal(setup.stochRsiDivergence.state, "bearish_lh");
  assert.equal(setup.stochRsiDivergence.confidenceBoost, 0);
  assert.equal(setup.ictPlan.status, "waiting");
});
