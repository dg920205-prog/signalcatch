import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildBacktestRequest,
  downloadBacktestCsv,
  renderExecutionCard,
  renderBacktestMetrics,
  renderBacktestResults,
  renderEquityCurve,
  renderTrades,
} from "../js/ui/backtest-view.js";
import { activateTab, bindTabs, renderSummary } from "../js/ui/dashboard.js";
import { createDom, snapshotArray } from "../js/ui/dom.js";
import { renderManualAssetCard, renderManualAssets } from "../js/ui/manual-assets.js";
import { renderScannerResults } from "../js/ui/scanner.js";
import { renderAuxiliary } from "../js/ui/auxiliary.js";

const INVALID_BACKTEST_SETTINGS = /잘못된 백테스트 설정입니다\./;

class FakeNode {
  constructor(tagName = "#text") {
    this.tagName = tagName;
    this.attributes = {};
    this.childNodes = [];
    this.listeners = {};
    this.textContent = "";
    this.hidden = false;
    this.focused = false;
    this.className = "";
    this.classList = {
      toggle: (name, enabled) => {
        const classes = new Set(this.className.split(" ").filter(Boolean));
        enabled ? classes.add(name) : classes.delete(name);
        this.className = [...classes].join(" ");
      },
    };
  }

  append(...nodes) {
    this.childNodes.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.childNodes = [...nodes];
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(name, listener) {
    this.listeners[name] = listener;
  }

  getAttribute(name) {
    return this.attributes[name];
  }

  focus() {
    this.focused = true;
  }
}

function createFakeDocument() {
  return {
    createElement(tagName) {
      return new FakeNode(tagName);
    },
    createTextNode(value) {
      const node = new FakeNode();
      node.textContent = String(value);
      return node;
    },
  };
}

function flattenText(node) {
  return [node.textContent, ...node.childNodes.flatMap(flattenText)].join("");
}

function findNodes(node, predicate) {
  return [
    ...(predicate(node) ? [node] : []),
    ...node.childNodes.flatMap((child) => findNodes(child, predicate)),
  ];
}

test("setText preserves HTML-looking content as literal text", () => {
  const dom = createDom(createFakeDocument());
  const node = new FakeNode("p");

  dom.setText(node, '<img src=x onerror="alert(1)">');

  assert.equal(node.textContent, '<img src=x onerror="alert(1)">');
});

test("el applies only allowlisted attributes and registers events with addEventListener", () => {
  const dom = createDom(createFakeDocument());
  const click = () => {};
  const node = dom.el("button", {
    id: "refresh",
    title: "Refresh",
    type: "button",
    value: "go",
    name: "refresh",
    placeholder: "Safe",
    role: "tab",
    "aria-label": "Refresh",
    "data-tab": "manual",
    class: "button",
    onclick: "alert(1)",
    style: "display:none",
    src: "https://attacker.invalid/a",
    href: "https://attacker.invalid/b",
    formaction: "https://attacker.invalid/c",
    onClick: click,
  });

  assert.deepEqual(node.attributes, {
    id: "refresh",
    title: "Refresh",
    type: "button",
    value: "go",
    name: "refresh",
    placeholder: "Safe",
    role: "tab",
    "aria-label": "Refresh",
    "data-tab": "manual",
    class: "button",
  });
  assert.equal(node.listeners.click, click);
});

test("index declares strict CSP and external stylesheet and module script", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.ok(
    html.includes(
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src https://api.bybit.com https://fapi.binance.com https://api.coingecko.com; object-src 'none'; base-uri 'none'; form-action 'none'",
    ),
  );
  assert.match(html, /<link rel="stylesheet" href="css\/styles\.css">/);
  assert.match(html, /<script type="module" src="js\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /\son[a-z]+=/i);
});

test("buildBacktestRequest returns only normalized selected symbols and config waits", () => {
  assert.deepEqual(
    buildBacktestRequest({
      symbols: [" btcusdt ", "ETH", "hbarusdt"],
      selected: [" hbar "],
      startDate: "2026-01-01",
      endDate: "2026-03-31",
    }),
    {
      symbols: ["HBAR"],
      modes: ["common", "scalp", "day", "daily", "swing"],
      startDate: "2026-01-01",
      endDate: "2026-03-31",
      roundTripFeePct: 0.11,
      roundTripSlippagePct: 0.2,
      waitCandles: {
        common: 8,
        scalp: 6,
        day: 12,
        daily: 6,
        swing: 4,
      },
    },
  );
});

test("buildBacktestRequest rejects invalid costs, dates, waits, modes, and empty symbols", () => {
  const valid = {
    symbols: ["BTC"],
    selected: ["BTC"],
    startDate: "2026-01-01",
    endDate: "2026-03-31",
  };

  assert.throws(() => buildBacktestRequest({ ...valid, roundTripFeePct: -1 }), INVALID_BACKTEST_SETTINGS);
  assert.throws(() => buildBacktestRequest({ ...valid, startDate: "2026-04-01" }), INVALID_BACKTEST_SETTINGS);
  assert.throws(() => buildBacktestRequest({ ...valid, waitCandles: { swing: 0 } }), INVALID_BACKTEST_SETTINGS);
  assert.throws(() => buildBacktestRequest({ ...valid, modes: ["turbo"] }), INVALID_BACKTEST_SETTINGS);
  assert.throws(() => buildBacktestRequest({ ...valid, selected: [] }), INVALID_BACKTEST_SETTINGS);
});

test("buildBacktestRequest strictly validates dates, decimal inputs, and combined costs", () => {
  const valid = {
    symbols: ["BTC"],
    selected: ["BTC"],
    startDate: "2026-01-01",
    endDate: "2026-03-31",
  };

  for (const date of ["2026-02-31", "2026-13-01"]) {
    assert.throws(() => buildBacktestRequest({ ...valid, startDate: date }), INVALID_BACKTEST_SETTINGS);
  }
  for (const value of ["", true, {}, "1e2"]) {
    assert.throws(() => buildBacktestRequest({ ...valid, roundTripFeePct: value }), INVALID_BACKTEST_SETTINGS);
  }
  for (const value of ["", true, {}, "2.5"]) {
    assert.throws(() => buildBacktestRequest({ ...valid, waitCandles: { scalp: value } }), INVALID_BACKTEST_SETTINGS);
  }
  assert.throws(
    () => buildBacktestRequest({ ...valid, roundTripFeePct: "9.9", roundTripSlippagePct: "0.2" }),
    INVALID_BACKTEST_SETTINGS,
  );
});

test("buildBacktestRequest converts hostile form state boundaries into a safe settings error", () => {
  const message = "잘못된 백테스트 설정입니다.";
  const valid = {
    symbols: ["BTC"],
    selected: ["BTC"],
    startDate: "2026-01-01",
    endDate: "2026-03-31",
  };
  const throwingGetter = (property) => Object.defineProperty({ ...valid }, property, {
    get() {
      throw new Error("private getter");
    },
  });
  const hostileArray = new Proxy(["BTC"], {
    get(target, property) {
      if (property === "length" || property === Symbol.iterator || property === "map") {
        throw new Error("private collection");
      }
      return target[property];
    },
  });

  for (const property of ["symbols", "selected", "modes", "startDate", "endDate", "roundTripFeePct", "roundTripSlippagePct", "waitCandles"]) {
    assert.throws(() => buildBacktestRequest(throwingGetter(property)), new RegExp(message));
  }
  assert.doesNotThrow(() => buildBacktestRequest({ ...valid, symbols: hostileArray }));
  assert.doesNotThrow(() => buildBacktestRequest({ ...valid, selected: hostileArray }));
  assert.throws(() => buildBacktestRequest({ ...valid, modes: hostileArray }), new RegExp(message));
  assert.throws(
    () => buildBacktestRequest({ ...valid, waitCandles: new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("private wait"); } }) }),
    new RegExp(message),
  );
  assert.throws(
    () => buildBacktestRequest(new Proxy({}, { get() { throw new Error("private form"); } })),
    new RegExp(message),
  );
  assert.throws(
    () => buildBacktestRequest(new Proxy({}, { getOwnPropertyDescriptor() { throw new Error("private descriptor"); } })),
    new RegExp(message),
  );
  const hostileIndex = ["BTC"];
  Object.defineProperty(hostileIndex, 0, {
    get() {
      throw new Error("private index");
    },
  });
  assert.throws(
    () => buildBacktestRequest({ ...valid, symbols: hostileIndex }),
    new RegExp(message),
  );
});

test("manual HBAR card stays visible and renders API-origin text as text nodes", () => {
  const dom = createDom(createFakeDocument());
  const container = new FakeNode("section");
  const hostileReason = '<img src=x onerror="alert(1)">';

  renderManualAssetCard(
    container,
    {
      id: "bybit:HBAR",
      symbol: "HBAR",
      exchange: "Bybit",
      status: "error",
      error: hostileReason,
      diagnostics: [{ kind: hostileReason, operation: "fetchTicker" }],
      modeResults: {},
    },
    { dom },
  );

  assert.equal(container.childNodes.length, 1);
  assert.equal(flattenText(container).includes("HBAR"), true);
  assert.equal(flattenText(container).includes(hostileReason), true);
  assert.equal(container.childNodes[0].tagName, "article");
});

test("renderers isolate hostile external rows and preserve safe content", () => {
  const dom = createDom(createFakeDocument());
  const hostile = new Proxy({}, { get() { throw new Error("blocked"); } });

  const manual = new FakeNode("section");
  renderManualAssets(manual, [{ symbol: "HBAR", modeResults: {} }, hostile], { dom });
  assert.equal(flattenText(manual).includes("HBAR"), true);

  const scanner = new FakeNode("section");
  renderScannerResults(scanner, [{ symbol: "BTC", modeResults: {} }, hostile], { dom });
  assert.equal(flattenText(scanner).includes("BTC"), true);

  const trades = new FakeNode("section");
  renderTrades(trades, [{ symbol: "ETH", mode: "day" }, hostile], { dom });
  assert.equal(flattenText(trades).includes("ETH"), true);

  const auxiliary = new FakeNode("section");
  renderAuxiliary(auxiliary, [{ title: "Regime", reason: "Neutral" }, hostile], { dom });
  assert.equal(flattenText(auxiliary).includes("Regime"), true);
});

test("scanner results expose a one-click backtest action for each candidate", () => {
  const dom = createDom(createFakeDocument());
  const container = new FakeNode("section");
  const selected = [];

  renderScannerResults(
    container,
    [{ symbol: "HBAR", exchange: "Bybit", modeResults: {} }],
    { dom, onBacktest: (symbol) => selected.push(symbol) },
  );

  const [button] = findNodes(
    container,
    (node) => node.tagName === "button" && flattenText(node) === "Backtest",
  );
  assert.ok(button);
  button.listeners.click();
  assert.deepEqual(selected, ["HBAR"]);
});

test("scanner results render expandable current setups for every timeframe", () => {
  const dom = createDom(createFakeDocument());
  const container = new FakeNode("section");
  const plan = {
    direction: "bull",
    entryLow: 98,
    entryHigh: 100,
    sl: 96,
    tp: 106,
  };
  const setups = Object.fromEntries(
    ["common", "scalp", "day", "daily", "swing"].map((mode) => [
      mode,
      {
        mode,
        direction: "bull",
        plan,
        recommendation: {
          label: "추천",
          split: mode === "daily"
            ? {
                entries: [{ label: "E1", price: 100, weightPct: 25 }],
                targets: [{ label: "TP1", price: 104, weightPct: 40 }],
              }
            : null,
        },
      },
    ]),
  );

  renderScannerResults(
    container,
    [{ symbol: "HBAR", exchange: "Bybit", status: "ready", price: 0.18, modeResults: {}, setups }],
    { dom },
  );

  const text = flattenText(container);
  assert.equal(text.includes("현재가"), true);
  assert.equal(text.includes("0.18"), true);
  assert.equal(text.includes("진입 구간"), true);
  assert.equal(text.includes("98 ~ 100"), true);
  assert.equal(text.includes("SL"), true);
  assert.equal(text.includes("96"), true);
  assert.equal(text.includes("TP"), true);
  assert.equal(text.includes("106"), true);
  assert.equal(text.includes("daily"), true);
  assert.equal(text.includes("분할 진입 E1 100 (25%)"), true);
  assert.equal(text.includes("분할 TP TP1 104 (40%)"), true);
});

test("metric renderer uses safe fallbacks for hostile getters", () => {
  const dom = createDom(createFakeDocument());
  const container = new FakeNode("section");
  const metrics = new Proxy({}, { get() { throw new Error("blocked"); } });

  assert.doesNotThrow(() => renderBacktestMetrics(container, metrics, { dom }));
  assert.equal(flattenText(container).includes("Closed trades"), true);
});

test("equity renderer draws a computed polyline and shows an empty state without closed trades", () => {
  const dom = createDom(createFakeDocument());
  const container = new FakeNode("section");

  renderEquityCurve(
    container,
    [
      { status: "closed", pnlPct: 4 },
      { status: "closed", pnlPct: -2 },
    ],
    { dom },
  );

  const [polyline] = findNodes(container, (node) => node.tagName === "polyline");
  assert.ok(polyline);
  assert.match(polyline.getAttribute("points"), /^12,/);
  assert.equal(flattenText(container).includes("Run a backtest"), false);

  renderEquityCurve(container, [], { dom });
  assert.equal(flattenText(container).includes("Run a backtest"), true);
});

test("downloadBacktestCsv creates a CSV blob, clicks its anchor, and revokes its URL", () => {
  const anchor = { clicked: false, click() { this.clicked = true; } };
  const blobs = [];
  const revoked = [];

  const filename = downloadBacktestCsv(
    [{ symbol: "HBAR", status: "closed", outcome: "win", pnlPct: 1 }],
    {
      BlobCtor: class {
        constructor(parts, options) {
          blobs.push({ parts, options });
        }
      },
      createAnchor: () => anchor,
      createObjectURL: () => "blob:signalcatch-test",
      revokeObjectURL: (url) => revoked.push(url),
      now: () => 123,
    },
  );

  assert.equal(filename, "signalcatch-backtest-123.csv");
  assert.equal(anchor.href, "blob:signalcatch-test");
  assert.equal(anchor.download, filename);
  assert.equal(anchor.clicked, true);
  assert.deepEqual(revoked, ["blob:signalcatch-test"]);
  assert.equal(blobs[0].options.type, "text/csv;charset=utf-8");
  assert.equal(blobs[0].parts[0].includes("'HBAR"), true);
});

test("execution card renders separate OOS metrics", () => {
  const dom = createDom(createFakeDocument());
  const container = new FakeNode("section");

  renderExecutionCard(
    container,
    {
      oosLabel: "In 12 / OOS 3",
      oosMetrics: { closedTrades: 2, winRatePct: 50, compoundedReturnPct: 1.25 },
    },
    { dom },
  );

  const text = flattenText(container);
  assert.equal(text.includes("In 12 / OOS 3"), true);
  assert.equal(text.includes("OOS 승률 50%"), true);
  assert.equal(text.includes("OOS 수익률 1.25%"), true);
});

test("summary renderer uses safe fallbacks for hostile getters", () => {
  const dom = createDom(createFakeDocument());
  const container = new FakeNode("section");
  const summary = new Proxy({}, { get() { throw new Error("blocked"); } });

  assert.doesNotThrow(() => renderSummary(container, summary, { dom }));
  assert.equal(flattenText(container).includes("Manual assets"), true);
});

test("renderers replace hostile text values without losing their containers", () => {
  const dom = createDom(createFakeDocument());
  const hostileText = new Proxy({}, {
    get(target, key) {
      if (key === Symbol.toPrimitive || key === "toString") {
        throw new Error("blocked");
      }
      return target[key];
    },
  });

  const manual = new FakeNode("section");
  assert.doesNotThrow(() => renderManualAssets(manual, [{ symbol: hostileText, status: hostileText }], { dom }));

  const scanner = new FakeNode("section");
  assert.doesNotThrow(() => renderScannerResults(scanner, [{ symbol: hostileText }], { dom }));

  const trades = new FakeNode("section");
  assert.doesNotThrow(() => renderTrades(trades, [{ symbol: hostileText }], { dom }));

  const auxiliary = new FakeNode("section");
  assert.doesNotThrow(() => renderAuxiliary(auxiliary, [{ title: hostileText }], { dom }));

  const summary = new FakeNode("section");
  assert.doesNotThrow(() => renderSummary(summary, { manualAssets: hostileText }, { dom }));
});

test("renderers replace hostile collections with safe empty output", () => {
  const dom = createDom(createFakeDocument());
  const hostile = new Proxy([], {
    get(target, property) {
      if (property === "length" || property === Symbol.iterator || property === "map") {
        throw new Error("blocked");
      }
      return target[property];
    },
  });

  const manual = new FakeNode("section");
  assert.doesNotThrow(() => renderManualAssets(manual, hostile, { dom }));
  assert.equal(flattenText(manual).includes("Add a symbol"), true);

  const scanner = new FakeNode("section");
  assert.doesNotThrow(() => renderScannerResults(scanner, hostile, { dom }));
  assert.equal(flattenText(scanner).includes("Symbol"), true);

  const trades = new FakeNode("section");
  assert.doesNotThrow(() => renderBacktestResults(trades, hostile, { dom }));
  assert.equal(flattenText(trades).includes("Outcome"), true);

  const auxiliary = new FakeNode("section");
  assert.doesNotThrow(() => renderAuxiliary(auxiliary, hostile, { dom }));
  assert.equal(flattenText(auxiliary).includes("Auxiliary market context"), true);
});

test("renderer snapshots skip hostile collection indexes without using iterators or map", () => {
  const dom = createDom(createFakeDocument());
  const assets = [{ symbol: "BTC" }, { symbol: "ETH" }];
  Object.defineProperty(assets, 0, {
    get() {
      throw new Error("blocked index");
    },
  });
  const collection = new Proxy(assets, {
    get(target, property) {
      if (property === Symbol.iterator || property === "map") {
        throw new Error("blocked traversal");
      }
      return target[property];
    },
  });
  const container = new FakeNode("section");

  assert.doesNotThrow(() => renderManualAssets(container, collection, { dom }));
  assert.equal(flattenText(container).includes("ETH"), true);
});

test("snapshotArray skips own accessors, inherited indexes, and descriptor trap failures", () => {
  let getterCalls = 0;
  const ownAccessor = [];
  ownAccessor.length = 2;
  Object.defineProperty(ownAccessor, 0, {
    get() {
      getterCalls += 1;
      return "ACCESSOR";
    },
  });
  ownAccessor[1] = "OWN";

  assert.deepEqual(snapshotArray(ownAccessor), { ok: true, truncated: false, values: ["OWN"] });
  assert.equal(getterCalls, 0);

  const inherited = [];
  inherited.length = 1;
  Array.prototype[0] = "INHERITED";
  try {
    assert.deepEqual(snapshotArray(inherited), { ok: true, truncated: false, values: [] });
  } finally {
    delete Array.prototype[0];
  }

  const descriptorTrap = new Proxy(["BTC"], {
    getOwnPropertyDescriptor() {
      throw new Error("blocked descriptor");
    },
  });
  assert.deepEqual(snapshotArray(descriptorTrap), { ok: false, values: [] });
});

test("strict backtest collections reject accessors and inherited indexes while renderers skip them", () => {
  let getterCalls = 0;
  const selected = [];
  selected.length = 1;
  Object.defineProperty(selected, 0, {
    get() {
      getterCalls += 1;
      return "BTC";
    },
  });
  const valid = {
    symbols: ["BTC"],
    selected,
    startDate: "2026-01-01",
    endDate: "2026-03-31",
  };
  assert.throws(() => buildBacktestRequest(valid), INVALID_BACKTEST_SETTINGS);
  assert.equal(getterCalls, 0);

  const inherited = [];
  inherited.length = 1;
  Array.prototype[0] = "BTC";
  try {
    assert.throws(
      () => buildBacktestRequest({ ...valid, selected: inherited }),
      INVALID_BACKTEST_SETTINGS,
    );
    const container = new FakeNode("section");
    assert.doesNotThrow(() => renderManualAssets(container, inherited, { dom: createDom(createFakeDocument()) }));
    assert.equal(flattenText(container).includes("Add a symbol"), true);
  } finally {
    delete Array.prototype[0];
  }
});

test("index exposes tab, progress, and backtest form accessibility contracts", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

  assert.match(html, /<nav class="tabs" role="tablist"/);
  for (const tab of ["manual", "scanner", "backtest", "auxiliary"]) {
    assert.match(html, new RegExp(`id="${tab}-tab"[^>]*role="tab"[^>]*aria-controls="${tab}-panel"[^>]*aria-selected="(?:true|false)"`));
    assert.match(html, new RegExp(`id="${tab}-panel"[^>]*role="tabpanel"[^>]*aria-labelledby="${tab}-tab"`));
  }
  assert.match(html, /<progress id="scanner-progress"[^>]*role="progressbar"[^>]*aria-label="Scanner progress"/);
  assert.match(html, /<label for="scanner-limit">Top symbols<\/label>/);
  assert.match(html, /<input id="scanner-limit" name="scannerLimit" type="number" value="100" min="10" max="200"/);
  assert.match(html, /<details class="usage-guide"/);
  assert.match(html, /How to use SignalCatch/);
  assert.match(html, /Entry zone, SL, and TP/);
  assert.match(html, /<label for="backtest-days">Preset days<\/label>/);
  assert.match(html, /<label for="backtest-symbols">Symbols<\/label>/);
  assert.match(html, /<input id="backtest-symbols"/);
  assert.match(html, /<label for="recommendation-mode">Recommendation mode<select/);
  assert.match(html, /<select id="recommendation-mode"/);
  for (const mode of ["common", "scalp", "day", "daily", "swing"]) {
    assert.match(html, new RegExp(`<option value="${mode}"`));
  }
  for (const [mode, wait] of [["Common", 8], ["Scalp", 6], ["Day", 12], ["Daily", 6], ["Swing", 4]]) {
    assert.match(html, new RegExp(`${mode}<input name="wait${mode}" type="number" value="${wait}"`));
  }
});

test("tab controller updates aria state, visibility, and arrow-key focus", () => {
  const buttons = ["manual", "scanner", "backtest", "auxiliary"].map((tab) => {
    const button = new FakeNode("button");
    button.setAttribute("data-tab", tab);
    return button;
  });
  const panels = ["manual", "scanner", "backtest", "auxiliary"].map((tab) => {
    const panel = new FakeNode("section");
    panel.setAttribute("data-panel", tab);
    return panel;
  });
  const root = {
    querySelectorAll(selector) {
      return selector === "[data-tab]" ? buttons : panels;
    },
  };

  bindTabs(root);
  activateTab("scanner", root);
  assert.equal(buttons[1].getAttribute("aria-selected"), "true");
  assert.equal(panels[1].hidden, false);
  assert.equal(panels[0].hidden, true);

  buttons[1].listeners.keydown({ key: "ArrowRight", preventDefault() {} });
  assert.equal(buttons[2].focused, true);
  assert.equal(buttons[2].getAttribute("aria-selected"), "true");
});
