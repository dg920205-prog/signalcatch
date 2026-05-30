import { BYBIT_BASE_URL } from "../config.js";
import { ApiDiagnosticError } from "../core/errors.js";
import { toUsdtSymbol } from "../core/symbols.js";
import { fetchJson } from "./http.js";

const EXCHANGE = "Bybit";

function formatError(operation) {
  return new ApiDiagnosticError("format", "Bybit 응답 형식이 올바르지 않습니다.", {
    exchange: EXCHANGE,
    operation,
  });
}

function createUrl(path, params) {
  const url = new URL(path, BYBIT_BASE_URL);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function requireBybitList(payload, operation) {
  if (!payload || payload.retCode !== 0 || !Array.isArray(payload.result?.list)) {
    throw formatError(operation);
  }

  return payload.result.list;
}

function toFiniteNumber(value, operation) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw formatError(operation);
  }

  return number;
}

export function normalizeBybitKlines(rows) {
  if (!Array.isArray(rows)) {
    throw formatError("캔들 조회");
  }

  return rows
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

export async function fetchBybitTicker(input) {
  const symbol = toUsdtSymbol(input);
  const url = createUrl("/v5/market/tickers", { category: "linear", symbol });
  const list = requireBybitList(
    await fetchJson(url, { exchange: EXCHANGE, operation: "티커 조회" }),
    "티커 조회",
  );
  const ticker = list[0];

  if (!ticker || ticker.symbol !== symbol) {
    throw new ApiDiagnosticError("not-found", "Bybit에서 종목을 찾지 못했습니다.", {
      exchange: EXCHANGE,
      operation: "티커 조회",
      symbol,
    });
  }

  return {
    symbol,
    price: toFiniteNumber(ticker.lastPrice, "티커 조회"),
  };
}

export async function searchBybitSymbols(input) {
  const symbol = toUsdtSymbol(input);
  const url = createUrl("/v5/market/instruments-info", {
    category: "linear",
    symbol,
  });
  const list = requireBybitList(
    await fetchJson(url, { exchange: EXCHANGE, operation: "종목 조회" }),
    "종목 조회",
  );
  const symbols = list
    .filter((item) => item?.symbol === symbol)
    .map((item) => item.symbol);

  if (symbols.length === 0) {
    throw new ApiDiagnosticError("not-found", "Bybit에서 종목을 찾지 못했습니다.", {
      exchange: EXCHANGE,
      operation: "종목 조회",
      symbol,
    });
  }

  return symbols;
}

export async function fetchBybitCandles(
  input,
  { interval = "60", limit = 200, start, end } = {},
) {
  const symbol = toUsdtSymbol(input);
  const url = createUrl("/v5/market/kline", {
    category: "linear",
    symbol,
    interval,
    limit,
    start,
    end,
  });
  const list = requireBybitList(
    await fetchJson(url, { exchange: EXCHANGE, operation: "캔들 조회" }),
    "캔들 조회",
  );

  return normalizeBybitKlines(list);
}

export async function fetchBybitHistory(
  input,
  { interval = "60", start, end = Date.now(), limit = 1000 } = {},
) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    throw new ApiDiagnosticError("input", "조회 기간이 올바르지 않습니다.", {
      exchange: EXCHANGE,
      operation: "과거 캔들 조회",
    });
  }

  const candlesByTime = new Map();
  let pageEnd = end;

  while (pageEnd >= start) {
    const page = await fetchBybitCandles(input, {
      interval,
      limit,
      start,
      end: pageEnd,
    });

    for (const candle of page) {
      if (candle.time >= start && candle.time <= end) {
        candlesByTime.set(candle.time, candle);
      }
    }

    if (page.length < limit) {
      break;
    }

    const oldestTime = page[0]?.time;

    if (!Number.isFinite(oldestTime) || oldestTime <= start) {
      break;
    }

    pageEnd = oldestTime - 1;
  }

  return [...candlesByTime.values()].sort((left, right) => left.time - right.time);
}
