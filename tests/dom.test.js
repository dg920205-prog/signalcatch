import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildBacktestRequest } from "../js/ui/backtest-view.js";
import { createDom } from "../js/ui/dom.js";
import { renderManualAssetCard } from "../js/ui/manual-assets.js";

class FakeNode {
  constructor(tagName = "#text") {
    this.tagName = tagName;
    this.attributes = {};
    this.childNodes = [];
    this.listeners = {};
    this.textContent = "";
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
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src https://api.bybit.com https://fapi.binance.com; object-src 'none'; base-uri 'none'; form-action 'none'",
    ),
  );
  assert.match(html, /<link rel="stylesheet" href="css\/styles\.css">/);
  assert.match(html, /<script type="module" src="js\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /\son[a-z]+=/i);
});

test("buildBacktestRequest returns normalized defaults and selected symbols", () => {
  assert.deepEqual(
    buildBacktestRequest({
      symbols: [" btcusdt ", "ETH", "BTC"],
      startDate: "2026-01-01",
      endDate: "2026-03-31",
    }),
    {
      symbols: ["BTC", "ETH"],
      modes: ["common", "scalp", "day", "daily", "swing"],
      startDate: "2026-01-01",
      endDate: "2026-03-31",
      roundTripFeePct: 0.11,
      roundTripSlippagePct: 0.2,
      waitCandles: {
        common: 8,
        scalp: 8,
        day: 8,
        daily: 8,
        swing: 8,
      },
    },
  );
});

test("buildBacktestRequest rejects invalid costs, dates, waits, modes, and empty symbols", () => {
  const valid = {
    symbols: ["BTC"],
    startDate: "2026-01-01",
    endDate: "2026-03-31",
  };

  assert.throws(() => buildBacktestRequest({ ...valid, roundTripFeePct: -1 }), /fee/i);
  assert.throws(() => buildBacktestRequest({ ...valid, startDate: "2026-04-01" }), /date/i);
  assert.throws(() => buildBacktestRequest({ ...valid, waitCandles: { swing: 0 } }), /wait/i);
  assert.throws(() => buildBacktestRequest({ ...valid, modes: ["turbo"] }), /mode/i);
  assert.throws(() => buildBacktestRequest({ ...valid, symbols: [] }), /symbol/i);
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
