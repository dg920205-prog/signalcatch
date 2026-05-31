import { BINANCE_BASE_URL } from "../config.js";
import { ApiDiagnosticError } from "../core/errors.js";
import { toUsdtSymbol } from "../core/symbols.js";
import { fetchJson } from "./http.js";

const EXCHANGE = "Binance";
const DECIMAL_NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const VALID_INTERVALS = new Set([
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
]);

function formatError(operation) {
  return new ApiDiagnosticError(
    "response-format",
    "Binance 응답 형식이 올바르지 않습니다.",
    { exchange: EXCHANGE, operation },
  );
}

function inputError(operation) {
  return new ApiDiagnosticError("input", "Binance 요청 값이 올바르지 않습니다.", {
    exchange: EXCHANGE,
    operation,
  });
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
  if (typeof value !== "number" && typeof value !== "string") {
    throw formatError(operation);
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!DECIMAL_NUMBER.test(trimmedValue)) {
      throw formatError(operation);
    }
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw formatError(operation);
  }

  return number;
}

function toPositiveNumber(value, operation) {
  const number = toFiniteNumber(value, operation);

  if (number <= 0) {
    throw formatError(operation);
  }

  return number;
}

function validateCandleOptions({ interval, limit, start, end }, operation) {
  if (!VALID_INTERVALS.has(String(interval))) {
    throw inputError(operation);
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 1500) {
    throw inputError(operation);
  }

  for (const timestamp of [start, end]) {
    if (timestamp !== undefined && (!Number.isInteger(timestamp) || timestamp <= 0)) {
      throw inputError(operation);
    }
  }

  if (start !== undefined && end !== undefined && start > end) {
    throw inputError(operation);
  }
}

export async function fetchBinanceTicker(input) {
  const symbol = toUsdtSymbol(input);
  const payload = await fetchJson(
    createUrl("/fapi/v2/ticker/price", { symbol }),
    { exchange: EXCHANGE, operation: "티커 조회" },
  );

  if (!payload || payload.symbol !== symbol) {
    throw formatError("티커 조회");
  }

  return {
    symbol,
    price: toPositiveNumber(payload.price, "티커 조회"),
  };
}

export async function fetchBinanceCandles(
  input,
  { interval = "1h", limit = 200, start, end } = {},
) {
  validateCandleOptions({ interval, limit, start, end }, "캔들 조회");

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

  return normalizeBinanceKlines(payload);
}

export function normalizeBinanceKlines(payload) {
  if (!Array.isArray(payload)) {
    throw formatError("캔들 조회");
  }

  return payload
    .map((row) => {
      if (!Array.isArray(row) || row.length < 6) {
        throw formatError("캔들 조회");
      }

      const candle = {
        time: toFiniteNumber(row[0], "캔들 조회"),
        open: toFiniteNumber(row[1], "캔들 조회"),
        high: toFiniteNumber(row[2], "캔들 조회"),
        low: toFiniteNumber(row[3], "캔들 조회"),
        close: toFiniteNumber(row[4], "캔들 조회"),
        volume: toFiniteNumber(row[5], "캔들 조회"),
      };

      if (
        !Number.isInteger(candle.time) ||
        candle.time <= 0 ||
        candle.open <= 0 ||
        candle.high <= 0 ||
        candle.low <= 0 ||
        candle.close <= 0 ||
        candle.volume < 0 ||
        candle.high < candle.low ||
        candle.open < candle.low ||
        candle.open > candle.high ||
        candle.close < candle.low ||
        candle.close > candle.high
      ) {
        throw formatError("캔들 조회");
      }

      return candle;
    })
    .sort((left, right) => left.time - right.time);
}
