import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiDiagnosticError,
  classifyHttpFailure,
} from "../js/core/errors.js";
import {
  fetchBybitCandles,
  fetchBybitHistory,
  fetchBybitTicker,
  normalizeBybitKlines,
  searchBybitSymbols,
} from "../js/api/bybit.js";
import {
  fetchBinanceCandles,
  fetchBinanceTicker,
  normalizeBinanceKlines,
} from "../js/api/binance.js";
import { fetchJson } from "../js/api/http.js";

async function withFetchStub(stub, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stub;

  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("classifies Bybit HTTP 429 failures as rate limits", () => {
  const error = classifyHttpFailure({
    exchange: "Bybit",
    operation: "캔들 조회",
    status: 429,
  });

  assert.equal(error.kind, "rate-limit");
  assert.match(error.userMessage, /잠시 후/);
});

test("normalizes Bybit klines into ascending order", () => {
  const candles = normalizeBybitKlines([
    ["2000", "2", "3", "1", "2.5", "10"],
    ["1000", "1", "2", "0.5", "1.5", "8"],
  ]);

  assert.deepEqual(
    candles.map((candle) => candle.time),
    [1000, 2000],
  );
});

test("rejects null numeric fields in Bybit klines", () => {
  assert.throws(
    () => normalizeBybitKlines([["1000", "1", "2", null, "1.5", "8"]]),
    (error) => error instanceof ApiDiagnosticError && error.kind === "response-format",
  );
  assert.throws(
    () => normalizeBybitKlines([["1000", "1", "2", undefined, "1.5", "8"]]),
    (error) => error instanceof ApiDiagnosticError && error.kind === "response-format",
  );
  assert.throws(
    () => normalizeBybitKlines([["1000", "1", "2", "   ", "1.5", "8"]]),
    (error) => error instanceof ApiDiagnosticError && error.kind === "response-format",
  );
});

test("rejects empty or null numeric fields in Binance klines", () => {
  assert.throws(
    () => normalizeBinanceKlines([[1000, "1", "2", "", "1.5", "8"]]),
    (error) => error instanceof ApiDiagnosticError && error.kind === "response-format",
  );
  assert.throws(
    () => normalizeBinanceKlines([[1000, "1", "2", null, "1.5", "8"]]),
    (error) => error instanceof ApiDiagnosticError && error.kind === "response-format",
  );
  assert.throws(
    () => normalizeBinanceKlines([[1000, "1", "2", undefined, "1.5", "8"]]),
    (error) => error instanceof ApiDiagnosticError && error.kind === "response-format",
  );
  assert.throws(
    () => normalizeBinanceKlines([[1000, "1", "2", "   ", "1.5", "8"]]),
    (error) => error instanceof ApiDiagnosticError && error.kind === "response-format",
  );
});

test("does not retain remote payloads in diagnostic details", () => {
  const error = new ApiDiagnosticError("network", "연결 실패", {
    exchange: "Bybit",
    operation: "티커 조회",
    payload: { secret: "remote data" },
    arbitrary: "private context",
  });

  assert.equal("payload" in error.detail, false);
  assert.equal("arbitrary" in error.detail, false);
  assert.equal(typeof error.detail.occurredAt, "string");
});

test("retains only safe scalar diagnostic detail values", () => {
  const error = new ApiDiagnosticError("http", "request failed", {
    exchange: { name: "Bybit" },
    operation: ["candle lookup"],
    status: { code: 500 },
    symbol: ["BTCUSDT"],
    occurredAt: "remote timestamp",
  });

  assert.deepEqual(Object.keys(error.detail), ["occurredAt"]);
  assert.match(error.detail.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("preserves rate-limit diagnostics without remote HTTP payloads", async () => {
  await withFetchStub(
    async () =>
      new Response(JSON.stringify({ remote: "payload" }), { status: 429 }),
    async () => {
      await assert.rejects(
        fetchJson("https://example.test", {
          exchange: "Bybit",
          operation: "캔들 조회",
        }),
        (error) =>
          error.kind === "rate-limit" &&
          error.detail.status === 429 &&
          !("payload" in error.detail),
      );
    },
  );
});

test("classifies ordinary HTTP failures as http diagnostics", async () => {
  await withFetchStub(
    async () => new Response("failure", { status: 500 }),
    async () => {
      await assert.rejects(
        fetchJson("https://example.test", {
          exchange: "Bybit",
          operation: "캔들 조회",
        }),
        (error) => error.kind === "http" && error.detail.status === 500,
      );
    },
  );
});

test("classifies fetch rejection as a network diagnostic", async () => {
  await withFetchStub(
    async () => {
      throw new Error("connection refused");
    },
    async () => {
      await assert.rejects(
        fetchJson("https://example.test", {
          exchange: "Bybit",
          operation: "캔들 조회",
        }),
        (error) => error.kind === "network" && /CORS/.test(error.userMessage),
      );
    },
  );
});

test("classifies timeout abort as a network diagnostic", async () => {
  await withFetchStub(
    async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("aborted")));
      }),
    async () => {
      await assert.rejects(
        fetchJson("https://example.test", {
          exchange: "Bybit",
          operation: "캔들 조회",
          timeoutMs: 1,
        }),
        (error) => error.kind === "network" && /CORS/.test(error.userMessage),
      );
    },
  );
});

test("fetches a valid Bybit ticker mark price", async () => {
  await withFetchStub(
    async () =>
      new Response(
        JSON.stringify({
          retCode: 0,
          result: { list: [{ symbol: "BTCUSDT", markPrice: "123.45" }] },
        }),
      ),
    async () => {
      assert.deepEqual(await fetchBybitTicker("btc"), {
        symbol: "BTCUSDT",
        price: 123.45,
      });
    },
  );
});

test("rejects null Bybit ticker mark prices", async () => {
  await withFetchStub(
    async () =>
      new Response(
        JSON.stringify({
          retCode: 0,
          result: { list: [{ symbol: "BTCUSDT", markPrice: null }] },
        }),
      ),
    async () => {
      await assert.rejects(
        fetchBybitTicker("btc"),
        (error) =>
          error instanceof ApiDiagnosticError && error.kind === "response-format",
      );
    },
  );
});

test("rejects non-positive Bybit ticker mark prices", async () => {
  await withFetchStub(
    async () =>
      new Response(
        JSON.stringify({
          retCode: 0,
          result: { list: [{ symbol: "BTCUSDT", markPrice: "0" }] },
        }),
      ),
    async () => {
      await assert.rejects(
        fetchBybitTicker("btc"),
        (error) => error.kind === "response-format",
      );
    },
  );
});

test("finds a valid Bybit symbol", async () => {
  await withFetchStub(
    async () =>
      new Response(
        JSON.stringify({
          retCode: 0,
          result: { list: [{ symbol: "BTCUSDT" }] },
        }),
      ),
    async () => {
      assert.deepEqual(await searchBybitSymbols("btc"), ["BTCUSDT"]);
    },
  );
});

test("fetches valid Bybit candles", async () => {
  await withFetchStub(
    async () =>
      new Response(
        JSON.stringify({
          retCode: 0,
          result: { list: [["1000", "1", "2", "0.5", "1.5", "8"]] },
        }),
      ),
    async () => {
      assert.deepEqual(await fetchBybitCandles("btc"), [
        { time: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 8 },
      ]);
    },
  );
});

test("rejects invalid Bybit candle interval and limit before fetching", async () => {
  let fetchCalled = false;

  await withFetchStub(
    async () => {
      fetchCalled = true;
      throw new Error("fetch should not run");
    },
    async () => {
      await assert.rejects(fetchBybitCandles("btc", { interval: "2" }), {
        kind: "input",
      });
      await assert.rejects(fetchBybitCandles("btc", { limit: 0 }), {
        kind: "input",
      });
      await assert.rejects(fetchBybitCandles("btc", { limit: 1.5 }), {
        kind: "input",
      });
    },
  );

  assert.equal(fetchCalled, false);
});

test("rejects invalid Bybit candle semantics", () => {
  assert.throws(
    () => normalizeBybitKlines([["0", "1", "2", "0.5", "1.5", "8"]]),
    (error) => error.kind === "response-format",
  );
  assert.throws(
    () => normalizeBybitKlines([["1000", "-1", "2", "0.5", "1.5", "8"]]),
    (error) => error.kind === "response-format",
  );
  assert.throws(
    () => normalizeBybitKlines([["1000", "1", "0.5", "2", "1.5", "8"]]),
    (error) => error.kind === "response-format",
  );
  assert.throws(
    () => normalizeBybitKlines([["1000", "1", "2", "0.5", "1.5", "-1"]]),
    (error) => error.kind === "response-format",
  );
  assert.throws(
    () => normalizeBybitKlines([["1000.5", "1", "2", "0.5", "1.5", "8"]]),
    (error) => error.kind === "response-format",
  );
  assert.throws(
    () => normalizeBybitKlines([["1000", "3", "4", "2", "5", "8"]]),
    (error) => error.kind === "response-format",
  );
});

test("fetches a valid Binance ticker price", async () => {
  await withFetchStub(
    async () => new Response(JSON.stringify({ symbol: "BTCUSDT", price: "123.45" })),
    async () => {
      assert.deepEqual(await fetchBinanceTicker("btc"), {
        symbol: "BTCUSDT",
        price: 123.45,
      });
    },
  );
});

test("rejects empty Binance ticker prices", async () => {
  await withFetchStub(
    async () => new Response(JSON.stringify({ symbol: "BTCUSDT", price: "" })),
    async () => {
      await assert.rejects(
        fetchBinanceTicker("btc"),
        (error) =>
          error instanceof ApiDiagnosticError && error.kind === "response-format",
      );
    },
  );
});

test("rejects non-positive Binance ticker prices", async () => {
  await withFetchStub(
    async () => new Response(JSON.stringify({ symbol: "BTCUSDT", price: "0" })),
    async () => {
      await assert.rejects(
        fetchBinanceTicker("btc"),
        (error) => error.kind === "response-format",
      );
    },
  );
});

test("normalizes Binance klines into ascending candle objects", async () => {
  await withFetchStub(
    async () =>
      new Response(
        JSON.stringify([
          [2000, "2", "3", "1", "2.5", "10"],
          [1000, "1", "2", "0.5", "1.5", "8"],
        ]),
      ),
    async () => {
      assert.deepEqual(await fetchBinanceCandles("btc"), [
        { time: 1000, open: 1, high: 2, low: 0.5, close: 1.5, volume: 8 },
        { time: 2000, open: 2, high: 3, low: 1, close: 2.5, volume: 10 },
      ]);
    },
  );
});

test("rejects invalid Binance candle interval and limit before fetching", async () => {
  let fetchCalled = false;

  await withFetchStub(
    async () => {
      fetchCalled = true;
      throw new Error("fetch should not run");
    },
    async () => {
      await assert.rejects(fetchBinanceCandles("btc", { interval: "60" }), {
        kind: "input",
      });
      await assert.rejects(fetchBinanceCandles("btc", { limit: 1501 }), {
        kind: "input",
      });
      await assert.rejects(fetchBinanceCandles("btc", { limit: 1.5 }), {
        kind: "input",
      });
    },
  );

  assert.equal(fetchCalled, false);
});

test("rejects invalid Binance candle semantics", () => {
  assert.throws(
    () => normalizeBinanceKlines([[0, "1", "2", "0.5", "1.5", "8"]]),
    (error) => error.kind === "response-format",
  );
  assert.throws(
    () => normalizeBinanceKlines([[1000, "1", "0.5", "2", "1.5", "8"]]),
    (error) => error.kind === "response-format",
  );
  assert.throws(
    () => normalizeBinanceKlines([[1000, "1", "2", "0.5", "1.5", "-1"]]),
    (error) => error.kind === "response-format",
  );
  assert.throws(
    () => normalizeBinanceKlines([[1000.5, "1", "2", "0.5", "1.5", "8"]]),
    (error) => error.kind === "response-format",
  );
  assert.throws(
    () => normalizeBinanceKlines([[1000, "0.25", "2", "0.5", "1.5", "8"]]),
    (error) => error.kind === "response-format",
  );
});

test("merges paginated Bybit history without duplicate candles", async () => {
  let callCount = 0;

  await withFetchStub(
    async () => {
      const rows =
        callCount++ === 0
          ? [
              ["3000", "3", "4", "2", "3.5", "12"],
              ["2000", "2", "3", "1", "2.5", "10"],
            ]
          : [
              ["2000", "2", "3", "1", "2.5", "10"],
              ["1000", "1", "2", "0.5", "1.5", "8"],
            ];

      return new Response(JSON.stringify({ retCode: 0, result: { list: rows } }));
    },
    async () => {
      const candles = await fetchBybitHistory("btc", {
        start: 1000,
        end: 3000,
        limit: 2,
      });

      assert.deepEqual(
        candles.map((candle) => candle.time),
        [1000, 2000, 3000],
      );
      assert.equal(callCount, 2);
    },
  );
});

test("rejects invalid Bybit history bounds before fetching", async () => {
  let fetchCalled = false;

  await withFetchStub(
    async () => {
      fetchCalled = true;
      throw new Error("fetch should not run");
    },
    async () => {
      await assert.rejects(fetchBybitHistory("btc", { start: null, end: 3000 }), {
        kind: "input",
      });
      await assert.rejects(fetchBybitHistory("btc", { start: 3000, end: 3000 }), {
        kind: "input",
      });
      await assert.rejects(fetchBybitHistory("btc", { start: 1000.5, end: 3000 }), {
        kind: "input",
      });
      await assert.rejects(fetchBybitHistory("btc", { start: 1000, end: 3000.5 }), {
        kind: "input",
      });
    },
  );

  assert.equal(fetchCalled, false);
});

test("rejects non-decreasing Bybit history pagination", async () => {
  await withFetchStub(
    async () =>
      new Response(
        JSON.stringify({
          retCode: 0,
          result: { list: [["2000", "1", "2", "0.5", "1.5", "8"]] },
        }),
      ),
    async () => {
      await assert.rejects(
        fetchBybitHistory("btc", { start: 1000, end: 3000, limit: 1 }),
        (error) => error.kind === "response-format",
      );
    },
  );
});

test("caps Bybit history pagination", async () => {
  let candleTime = 5000;

  await withFetchStub(
    async () =>
      new Response(
        JSON.stringify({
          retCode: 0,
          result: {
            list: [[String(candleTime--), "1", "2", "0.5", "1.5", "8"]],
          },
        }),
      ),
    async () => {
      await assert.rejects(
        fetchBybitHistory("btc", { start: 1, end: 6000, limit: 1 }),
        (error) => error.kind === "response-format",
      );
    },
  );
});
