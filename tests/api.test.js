import assert from "node:assert/strict";
import test from "node:test";

import {
  ApiDiagnosticError,
  classifyHttpFailure,
} from "../js/core/errors.js";
import {
  fetchBybitHistory,
  normalizeBybitKlines,
} from "../js/api/bybit.js";
import { fetchBinanceCandles } from "../js/api/binance.js";
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

test("does not retain remote payloads in diagnostic details", () => {
  const error = new ApiDiagnosticError("network", "연결 실패", {
    exchange: "Bybit",
    operation: "티커 조회",
    payload: { secret: "remote data" },
  });

  assert.equal("payload" in error.detail, false);
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
