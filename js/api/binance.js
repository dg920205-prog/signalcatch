import { BINANCE_BASE_URL } from "../config.js";
import { ApiDiagnosticError } from "../core/errors.js";
import { toUsdtSymbol } from "../core/symbols.js";
import { fetchJson } from "./http.js";

const EXCHANGE = "Binance";

function formatError(operation) {
  return new ApiDiagnosticError(
    "format",
    "Binance 응답 형식이 올바르지 않습니다.",
    { exchange: EXCHANGE, operation },
  );
}

function createUrl(path, params) {
  const url = new URL(path, BINANCE_BASE_URL);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function toFiniteNumber(value, operation) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw formatError(operation);
  }

  return number;
}

export async function fetchBinanceTicker(input) {
  const symbol = toUsdtSymbol(input);
  const payload = await fetchJson(
    createUrl("/fapi/v1/ticker/price", { symbol }),
    { exchange: EXCHANGE, operation: "티커 조회" },
  );

  if (!payload || payload.symbol !== symbol) {
    throw formatError("티커 조회");
  }

  return {
    symbol,
    price: toFiniteNumber(payload.price, "티커 조회"),
  };
}

export async function fetchBinanceCandles(
  input,
  { interval = "1h", limit = 200, start, end } = {},
) {
  const symbol = toUsdtSymbol(input);
  const payload = await fetchJson(
    createUrl("/fapi/v1/klines", {
      symbol,
      interval,
      limit,
      startTime: start,
      endTime: end,
    }),
    { exchange: EXCHANGE, operation: "캔들 조회" },
  );

  if (!Array.isArray(payload)) {
    throw formatError("캔들 조회");
  }

  return payload
    .map((row) => {
      if (!Array.isArray(row) || row.length < 6) {
        throw formatError("캔들 조회");
      }

      return {
        time: toFiniteNumber(row[0], "캔들 조회"),
        open: toFiniteNumber(row[1], "캔들 조회"),
        high: toFiniteNumber(row[2], "캔들 조회"),
        low: toFiniteNumber(row[3], "캔들 조회"),
        close: toFiniteNumber(row[4], "캔들 조회"),
        volume: toFiniteNumber(row[5], "캔들 조회"),
      };
    })
    .sort((left, right) => left.time - right.time);
}
