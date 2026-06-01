import { analyzeCandles, classifyModes } from "../analysis/signals.js";
import { normalizeBaseSymbol } from "../core/symbols.js";

const EXCHANGES = {
  bybit: "Bybit",
  binance: "Binance",
};

function clone(value) {
  return structuredClone(value);
}

function safeDetail(detail) {
  const safe = {};

  if (!detail || typeof detail !== "object") {
    return safe;
  }

  for (const key of ["exchange", "operation", "symbol", "occurredAt"]) {
    if (typeof detail[key] === "string") {
      safe[key] = detail[key];
    }
  }

  if (Number.isInteger(detail.status) || typeof detail.status === "string") {
    safe.status = detail.status;
  }

  return safe;
}

function diagnostic(error, operation) {
  const detail = safeDetail(error?.detail);

  return {
    kind: typeof error?.kind === "string" ? error.kind : "unknown",
    ...detail,
    operation: detail.operation ?? operation,
  };
}

function exchangeName(input) {
  const key = String(input ?? "").trim().toLowerCase();
  const exchange = EXCHANGES[key];

  if (!exchange) {
    throw new Error("Unsupported exchange.");
  }

  return { key, exchange };
}

export function createManualAssetService(adapters) {
  const assets = new Map();

  async function load(asset) {
    const adapter = adapters?.[asset.exchange.toLowerCase()];

    if (!adapter) {
      throw new Error("Missing exchange adapter.");
    }

    asset.status = "loading";
    asset.error = null;
    asset.diagnostics = [];

    const [tickerResult, candlesResult] = await Promise.allSettled([
      adapter.fetchTicker(asset.symbol),
      adapter.fetchCandles(asset.symbol),
    ]);

    if (tickerResult.status === "fulfilled") {
      asset.ticker = tickerResult.value;
    } else {
      asset.diagnostics.push(diagnostic(tickerResult.reason, "fetchTicker"));
    }

    if (candlesResult.status === "fulfilled") {
      try {
        asset.analysis = analyzeCandles(candlesResult.value);
        asset.modeResults = classifyModes(asset.analysis);
      } catch (error) {
        asset.diagnostics.push(diagnostic(error, "analyzeCandles"));
      }
    } else {
      asset.diagnostics.push(diagnostic(candlesResult.reason, "fetchCandles"));
    }

    asset.status = asset.diagnostics.length === 0 ? "ready" : "error";
    asset.error =
      asset.status === "error" ? "Some asset data could not be loaded." : null;

    return clone(asset);
  }

  return {
    async add({ symbol, exchange }) {
      const normalizedSymbol = normalizeBaseSymbol(symbol);
      const normalizedExchange = exchangeName(exchange);
      const id = `${normalizedExchange.key}:${normalizedSymbol}`;

      if (assets.has(id)) {
        throw new Error("Manual asset already exists.");
      }

      const asset = {
        id,
        symbol: normalizedSymbol,
        exchange: normalizedExchange.exchange,
        visible: true,
        status: "loading",
        error: null,
        diagnostics: [],
        ticker: null,
        analysis: null,
        modeResults: classifyModes(),
      };

      assets.set(id, asset);
      return load(asset);
    },

    refresh(id) {
      const asset = assets.get(id);

      if (!asset) {
        return Promise.reject(new Error("Manual asset not found."));
      }

      return load(asset);
    },

    remove(id) {
      return assets.delete(id);
    },

    list() {
      return [...assets.values()].map(clone);
    },
  };
}
