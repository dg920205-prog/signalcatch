import { BYBIT_BASE_URL } from "../config.js";
import { ApiDiagnosticError } from "../core/errors.js";
import { toUsdtSymbol } from "../core/symbols.js";
import { fetchJson } from "./http.js";

const EXCHANGE = "Bybit";
const MAX_HISTORY_PAGES = 1000;
const MAX_UNIVERSE_PAGES = 10;
const DECIMAL_NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const VALID_INTERVALS = new Set([
  "1",
  "3",
  "5",
  "15",
  "30",
  "60",
  "120",
  "240",
  "360",
  "720",
  "D",
  "W",
  "M",
]);

function formatError(operation) {
  return new ApiDiagnosticError("response-format", "Bybit 응답 형식이 올바르지 않습니다.", {
    exchange: EXCHANGE,
    operation,
  });
}

function inputError(operation) {
  return new ApiDiagnosticError("input", "Bybit 요청 값이 올바르지 않습니다.", {
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
  if (payload?.retCode === 10006) {
    throw new ApiDiagnosticError(
      "rate-limit",
      "Bybit 호출 제한에 도달했습니다. 잠시 후 다시 시도해 주세요.",
      { exchange: EXCHANGE, operation, status: payload.retCode },
    );
  }

  if (!payload || payload.retCode !== 0 || !Array.isArray(payload.result?.list)) {
    throw formatError(operation);
  }

  return payload.result.list;
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

function validateCandleOptions({ interval, limit, start, end }, operation) {
  if (!VALID_INTERVALS.has(String(interval))) {
    throw inputError(operation);
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
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

export function normalizeBybitKlines(rows) {
  if (!Array.isArray(rows)) {
    throw formatError("캔들 조회");
  }

  return rows
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

export function dropUnclosedCandle(candles) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  return candles.slice(0, -1);
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
    price: toPositiveNumber(ticker.lastPrice, "티커 조회"),
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

export async function fetchBybitTopSymbols({ limit = 100 } = {}) {
  if (!Number.isInteger(limit) || limit < 10 || limit > 200) {
    throw inputError("scanner universe");
  }

  const instruments = [];
  const seenCursors = new Set();
  let cursor;
  for (let page = 0; page < MAX_UNIVERSE_PAGES; page += 1) {
    const payload = await fetchJson(
      createUrl("/v5/market/instruments-info", { category: "linear", limit: 1000, cursor }),
      {
        exchange: EXCHANGE,
        operation: "scanner universe",
      },
    );
    instruments.push(...requireBybitList(payload, "scanner universe"));
    const nextCursor = payload.result?.nextPageCursor;
    if (!nextCursor) break;
    if (typeof nextCursor !== "string" || seenCursors.has(nextCursor)) {
      throw formatError("scanner universe");
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
    if (page === MAX_UNIVERSE_PAGES - 1) {
      throw formatError("scanner universe");
    }
  }
  const tickers = requireBybitList(
    await fetchJson(createUrl("/v5/market/tickers", { category: "linear" }), {
      exchange: EXCHANGE,
      operation: "scanner universe",
    }),
    "scanner universe",
  );
  const allowed = new Set(
    instruments
      .filter(
        (item) =>
          item?.contractType === "LinearPerpetual" &&
          item?.status === "Trading" &&
          item?.quoteCoin === "USDT" &&
          typeof item?.symbol === "string" &&
          item.symbol.endsWith("USDT"),
      )
      .map((item) => item.symbol),
  );

  return tickers
    .flatMap((ticker) => {
      try {
        const symbol = ticker?.symbol;
        const turnover24h = toFiniteNumber(ticker?.turnover24h, "scanner universe");
        return allowed.has(symbol) && turnover24h >= 0
          ? [{ symbol, turnover24h }]
          : [];
      } catch {
        return [];
      }
    })
    .sort((left, right) => right.turnover24h - left.turnover24h)
    .slice(0, limit)
    .map(({ symbol }) => symbol.slice(0, -"USDT".length));
}

export async function fetchBybitMarketTickers() {
  const tickers = requireBybitList(
    await fetchJson(createUrl("/v5/market/tickers", { category: "linear" }), {
      exchange: EXCHANGE,
      operation: "market heatmap",
    }),
    "market heatmap",
  );

  return tickers.flatMap((ticker) => {
    try {
      if (typeof ticker?.symbol !== "string" || !ticker.symbol.endsWith("USDT")) {
        return [];
      }
      return [{
        symbol: ticker.symbol.slice(0, -"USDT".length),
        price: toPositiveNumber(ticker.lastPrice, "market heatmap"),
        turnover24h: toFiniteNumber(ticker.turnover24h, "market heatmap"),
        change24hPct: toFiniteNumber(ticker.price24hPcnt, "market heatmap") * 100,
      }];
    } catch {
      return [];
    }
  });
}

export async function fetchBybitCandles(
  input,
  { interval = "60", limit = 200, start, end } = {},
) {
  validateCandleOptions({ interval, limit, start, end }, "캔들 조회");

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
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start <= 0 ||
    end <= 0 ||
    start >= end
  ) {
    throw new ApiDiagnosticError("input", "조회 기간이 올바르지 않습니다.", {
      exchange: EXCHANGE,
      operation: "과거 캔들 조회",
    });
  }

  const candlesByTime = new Map();
  let pageEnd = end;
  let pageCount = 0;

  while (pageEnd >= start) {
    if (pageCount >= MAX_HISTORY_PAGES) {
      throw formatError("과거 캔들 조회");
    }
    pageCount += 1;

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

    const nextPageEnd = oldestTime - 1;

    if (nextPageEnd >= pageEnd) {
      throw formatError("과거 캔들 조회");
    }

    pageEnd = nextPageEnd;
  }

  return [...candlesByTime.values()].sort((left, right) => left.time - right.time);
}

function toPositiveNumber(value, operation) {
  const number = toFiniteNumber(value, operation);

  if (number <= 0) {
    throw formatError(operation);
  }

  return number;
}
