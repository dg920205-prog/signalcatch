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

test("save snapshots getter values before validating and persisting them", () => {
  function changingGetter(name, first, second) {
    let reads = 0;
    return {
      get() {
        reads += 1;
        const count = reads;
        snapshots.set(name, count);
        return reads === 1 ? first : second;
      },
    };
  }

  const snapshots = new Map();
  const backend = createMemoryStorage();
  const storage = createStorage(backend);
  const settings = {};
  const asset = {};
  const ui = {};
  const backtestDefaults = {};
  const waitCandles = {};

  Object.defineProperties(settings, {
    persist: changingGetter("persist", true, false),
    manualAssets: changingGetter("manualAssets", [asset], []),
    ui: changingGetter("ui", ui, {}),
    backtestDefaults: changingGetter("backtestDefaults", backtestDefaults, {}),
  });
  Object.defineProperties(asset, {
    symbol: changingGetter("symbol", "btcusdt", "<bad>"),
    exchange: changingGetter("exchange", "bybit", "other"),
  });
  Object.defineProperties(ui, {
    activeTab: changingGetter("activeTab", "scanner", "invalid"),
    selectedMode: changingGetter("selectedMode", "day", "invalid"),
    theme: changingGetter("theme", "navy", "light"),
  });
  Object.defineProperties(backtestDefaults, {
    presetDays: changingGetter("presetDays", 30, 0),
    roundTripFeePct: changingGetter("roundTripFeePct", 0.11, 11),
    roundTripSlippagePct: changingGetter("roundTripSlippagePct", 0.2, -1),
    waitCandles: changingGetter("waitCandles", waitCandles, {}),
  });
  Object.defineProperties(waitCandles, {
    common: changingGetter("common", 8, 0),
  });

  storage.save(settings);

  assert.deepEqual(JSON.parse(backend.snapshot()[STORAGE_KEY]), {
    persist: true,
    manualAssets: [{ symbol: "BTC", exchange: "bybit" }],
    ui: { activeTab: "scanner", selectedMode: "day", theme: "navy" },
    backtestDefaults: {
      presetDays: 30,
      roundTripFeePct: 0.11,
      roundTripSlippagePct: 0.2,
      waitCandles: { common: 8 },
    },
  });
  assert.deepEqual(Object.fromEntries(snapshots), {
    persist: 1,
    manualAssets: 1,
    ui: 1,
    backtestDefaults: 1,
    symbol: 1,
    exchange: 1,
    activeTab: 1,
    selectedMode: 1,
    theme: 1,
    presetDays: 1,
    roundTripFeePct: 1,
    roundTripSlippagePct: 1,
    waitCandles: 1,
    common: 1,
  });
});

test("save ignores throwing field getters while preserving other safe values", () => {
  const throwingGetter = {
    get() {
      throw new Error("blocked");
    },
  };
  const backend = createMemoryStorage();
  const storage = createStorage(backend);
  const badAsset = { exchange: "bybit" };
  const ui = { activeTab: "manual", theme: "navy" };

  Object.defineProperty(badAsset, "symbol", throwingGetter);
  Object.defineProperty(ui, "selectedMode", throwingGetter);

  storage.save({
    persist: true,
    manualAssets: [badAsset, { symbol: "eth", exchange: "binance" }],
    ui,
    backtestDefaults: {
      presetDays: 7,
      roundTripFeePct: 0.1,
      roundTripSlippagePct: 0.2,
      waitCandles: new Proxy(
        { common: 8, swing: 4 },
        {
          get(target, property) {
            if (property === "swing") {
              throw new Error("blocked");
            }
            return target[property];
          },
        },
      ),
    },
  });

  assert.deepEqual(JSON.parse(backend.snapshot()[STORAGE_KEY]), {
    persist: true,
    manualAssets: [{ symbol: "ETH", exchange: "binance" }],
    ui: { activeTab: "manual", theme: "navy" },
    backtestDefaults: {
      presetDays: 7,
      roundTripFeePct: 0.1,
      roundTripSlippagePct: 0.2,
      waitCandles: { common: 8 },
    },
  });
});

test("clear removes saved settings", () => {
  const backend = createMemoryStorage({ [STORAGE_KEY]: '{"persist":true}' });

  createStorage(backend).clear();

  assert.deepEqual(backend.snapshot(), {});
});

test("state returns copies and notifies subscribers", () => {
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

test("state isolates nested initial, patch, read, and listener values", () => {
  const initial = { ui: { activeTab: "manual" } };
  const patch = { filters: { exchange: "bybit" } };
  const state = createState(initial);
  let notification;

  state.subscribe((nextState) => {
    notification = nextState;
    nextState.ui.activeTab = "listener-mutated";
    nextState.filters.exchange = "listener-mutated";
  });

  initial.ui.activeTab = "initial-mutated";
  state.setState(patch);
  patch.filters.exchange = "patch-mutated";

  const firstRead = state.getState();
  firstRead.ui.activeTab = "read-mutated";
  firstRead.filters.exchange = "read-mutated";

  assert.deepEqual(notification, {
    ui: { activeTab: "listener-mutated" },
    filters: { exchange: "listener-mutated" },
  });
  assert.deepEqual(state.getState(), {
    ui: { activeTab: "manual" },
    filters: { exchange: "bybit" },
  });
});

test("state removes prototype pollution keys while cloning boundaries", () => {
  const polluted = JSON.parse(
    '{"safe":{"value":1,"__proto__":{"nestedPolluted":true}},"__proto__":{"polluted":true},"constructor":{"polluted":true},"prototype":{"polluted":true}}',
  );
  const state = createState(polluted);

  assert.deepEqual(state.getState(), { safe: { value: 1 } });
  assert.equal({}.polluted, undefined);
  assert.equal({}.nestedPolluted, undefined);
});

test("state does not invoke unsafe or ordinary accessor properties", () => {
  let unsafeGetterCalls = 0;
  let ordinaryGetterCalls = 0;
  const initial = { safe: "kept" };

  Object.defineProperty(initial, "__proto__", {
    enumerable: true,
    get() {
      unsafeGetterCalls += 1;
      return { polluted: true };
    },
  });
  Object.defineProperty(initial, "computed", {
    enumerable: true,
    get() {
      ordinaryGetterCalls += 1;
      return "remove-me";
    },
  });

  assert.deepEqual(createState(initial).getState(), { safe: "kept" });
  assert.equal(unsafeGetterCalls, 0);
  assert.equal(ordinaryGetterCalls, 0);
});

test("state ignores throwing nested getters without interrupting setState", () => {
  const state = createState({ count: 1 });
  const patch = { nested: { safe: "kept" } };

  Object.defineProperty(patch.nested, "blocked", {
    enumerable: true,
    get() {
      throw new Error("blocked");
    },
  });

  assert.doesNotThrow(() => state.setState(patch));
  assert.deepEqual(state.getState(), { count: 1, nested: { safe: "kept" } });
});

test("state treats hostile proxy initial values as empty state and ignores hostile patches", () => {
  const hostileInitial = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw new Error("blocked");
      },
    },
  );
  const hostilePatch = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error("blocked");
      },
    },
  );
  const hostileDescriptorPatch = new Proxy(
    { blocked: true },
    {
      getOwnPropertyDescriptor() {
        throw new Error("blocked");
      },
    },
  );
  const state = createState(hostileInitial);

  assert.deepEqual(state.getState(), {});
  assert.doesNotThrow(() => state.setState(hostilePatch));
  assert.doesNotThrow(() => state.setState(hostileDescriptorPatch));
  assert.deepEqual(state.getState(), {});
});

test("state ignores non-plain values, cycles, and values beyond the depth limit", () => {
  const cyclic = {};
  cyclic.self = cyclic;
  let tooDeep = "remove-me";

  for (let index = 0; index < 21; index += 1) {
    tooDeep = { nested: tooDeep };
  }

  const state = createState({
    keep: [null, "text", true, 1],
    nonFinite: Number.POSITIVE_INFINITY,
    date: new Date(),
    fn() {},
    symbol: Symbol("remove-me"),
    bigint: 1n,
    cyclic,
    tooDeep,
  });

  assert.deepEqual(state.getState(), { keep: [null, "text", true, 1] });
});

test("state isolates listener failures and still calls later listeners", () => {
  const state = createState({ count: 0 });
  const notifications = [];

  state.subscribe(() => {
    throw new Error("blocked");
  });
  state.subscribe((nextState) => notifications.push(nextState));

  assert.doesNotThrow(() => state.setState({ count: 1 }));
  assert.deepEqual(notifications, [{ count: 1 }]);
  assert.deepEqual(state.getState(), { count: 1 });
});
