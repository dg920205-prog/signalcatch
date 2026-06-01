import assert from "node:assert/strict";
import test from "node:test";

import { STORAGE_KEY } from "../js/config.js";
import { createState } from "../js/state.js";
import { createStorage } from "../js/storage.js";

function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    snapshot() {
      return Object.fromEntries(values);
    },
  };
}

const SAFE_DEFAULTS = {
  persist: false,
  manualAssets: [],
  ui: {},
  backtestDefaults: {
    waitCandles: {},
  },
};

test("save removes stored settings while persistence consent is off", () => {
  const backend = createMemoryStorage({ [STORAGE_KEY]: '{"persist":true}' });
  const storage = createStorage(backend);

  storage.save({ persist: false, manualAssets: [{ symbol: "BTC", exchange: "bybit" }] });

  assert.deepEqual(backend.snapshot(), {});
});

test("save persists only allowlisted sanitized settings after consent", () => {
  const backend = createMemoryStorage();
  const storage = createStorage(backend);

  storage.save({
    persist: true,
    secret: "remove-me",
    manualAssets: [
      { symbol: " btcusdt ", exchange: "bybit", secret: "remove-me" },
      { symbol: "BTC", exchange: "bybit" },
      { symbol: "eth", exchange: "binance" },
    ],
    ui: {
      activeTab: "scanner",
      selectedMode: "swing",
      theme: "navy",
      secret: "remove-me",
    },
    backtestDefaults: {
      presetDays: 30,
      roundTripFeePct: 0.11,
      roundTripSlippagePct: 0.2,
      waitCandles: { common: 8, swing: 4, secret: 99 },
      secret: "remove-me",
    },
  });

  assert.deepEqual(JSON.parse(backend.snapshot()[STORAGE_KEY]), {
    persist: true,
    manualAssets: [
      { symbol: "BTC", exchange: "bybit" },
      { symbol: "ETH", exchange: "binance" },
    ],
    ui: {
      activeTab: "scanner",
      selectedMode: "swing",
      theme: "navy",
    },
    backtestDefaults: {
      presetDays: 30,
      roundTripFeePct: 0.11,
      roundTripSlippagePct: 0.2,
      waitCandles: { common: 8, swing: 4 },
    },
  });
});

test("load restores sanitized settings", () => {
  const backend = createMemoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      persist: true,
      manualAssets: [{ symbol: "solusdt", exchange: "bybit" }],
      ui: { activeTab: "manual", selectedMode: "day", theme: "navy" },
      backtestDefaults: {
        presetDays: 365,
        roundTripFeePct: 10,
        roundTripSlippagePct: 0,
        waitCandles: { scalp: 1, daily: 500 },
      },
    }),
  });

  assert.deepEqual(createStorage(backend).load(), {
    persist: true,
    manualAssets: [{ symbol: "SOL", exchange: "bybit" }],
    ui: { activeTab: "manual", selectedMode: "day", theme: "navy" },
    backtestDefaults: {
      presetDays: 365,
      roundTripFeePct: 10,
      roundTripSlippagePct: 0,
      waitCandles: { scalp: 1, daily: 500 },
    },
  });
});

test("load returns safe defaults for malformed JSON and backend errors", () => {
  assert.deepEqual(
    createStorage(createMemoryStorage({ [STORAGE_KEY]: "{not-json" })).load(),
    SAFE_DEFAULTS,
  );
  assert.deepEqual(
    createStorage({
      getItem() {
        throw new Error("blocked");
      },
    }).load(),
    SAFE_DEFAULTS,
  );
});

test("save and clear ignore backend errors", () => {
  const storage = createStorage({
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  });

  assert.doesNotThrow(() => storage.save({ persist: true }));
  assert.doesNotThrow(() => storage.save({ persist: false }));
  assert.doesNotThrow(() => storage.clear());
});

test("invalid settings, assets, and nested keys are removed", () => {
  const assets = Array.from({ length: 105 }, (_, index) => ({
    symbol: `A${index}`,
    exchange: index % 2 ? "binance" : "bybit",
  }));
  assets.unshift(
    { symbol: "<bad>", exchange: "bybit" },
    { symbol: "BTC", exchange: "other" },
    null,
  );

  const backend = createMemoryStorage({
    [STORAGE_KEY]: JSON.stringify({
      persist: true,
      secret: "remove-me",
      manualAssets: assets,
      ui: {
        activeTab: "invalid",
        selectedMode: "invalid",
        theme: "light",
        secret: "remove-me",
      },
      backtestDefaults: {
        presetDays: 0,
        roundTripFeePct: 11,
        roundTripSlippagePct: -1,
        waitCandles: {
          common: 0,
          scalp: 501,
          day: 1.5,
          daily: "4",
          swing: 7,
          secret: 4,
        },
        secret: "remove-me",
      },
    }),
  });

  const loaded = createStorage(backend).load();

  assert.equal(loaded.manualAssets.length, 100);
  assert.deepEqual(loaded.ui, {});
  assert.deepEqual(loaded.backtestDefaults, { waitCandles: { swing: 7 } });
  assert.equal("secret" in loaded, false);
});

test("load and save discard prototype pollution keys", () => {
  const polluted = JSON.parse(
    '{"persist":true,"__proto__":{"polluted":true},"ui":{"theme":"navy","constructor":{"polluted":true},"prototype":{"polluted":true}}}',
  );
  const backend = createMemoryStorage({ [STORAGE_KEY]: JSON.stringify(polluted) });
  const storage = createStorage(backend);

  assert.deepEqual(storage.load(), {
    persist: true,
    manualAssets: [],
    ui: { theme: "navy" },
    backtestDefaults: { waitCandles: {} },
  });

  storage.save(polluted);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(JSON.parse(backend.snapshot()[STORAGE_KEY]), {
    persist: true,
    manualAssets: [],
    ui: { theme: "navy" },
    backtestDefaults: { waitCandles: {} },
  });
});

test("clear removes saved settings", () => {
  const backend = createMemoryStorage({ [STORAGE_KEY]: '{"persist":true}' });

  createStorage(backend).clear();

  assert.deepEqual(backend.snapshot(), {});
});

test("state returns shallow copies and notifies subscribers", () => {
  const state = createState({ activeTab: "manual", count: 1 });
  const notifications = [];
  const unsubscribe = state.subscribe((nextState) => notifications.push(nextState));

  const firstRead = state.getState();
  firstRead.count = 99;
  state.setState({ count: 2 });
  unsubscribe();
  state.setState({ count: 3 });

  assert.deepEqual(firstRead, { activeTab: "manual", count: 99 });
  assert.deepEqual(state.getState(), { activeTab: "manual", count: 3 });
  assert.deepEqual(notifications, [{ activeTab: "manual", count: 2 }]);
});
