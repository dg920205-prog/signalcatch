import { analyzeCandles, classifyModes } from "../analysis/signals.js";
import { normalizeBaseSymbol } from "../core/symbols.js";

const EXCHANGES = {
  bybit: "Bybit",
  binance: "Binance",
};

function clone(value) {
  return structuredClone(value);
}

function safeRead(value, key) {
  try {
    return value?.[key];
  } catch {
    return undefined;
  }
}

function safeDetail(detail) {
  const safe = {};

  if (!detail || typeof detail !== "object") {
    return safe;
  }

  for (const key of ["exchange", "operation", "symbol", "occurredAt"]) {
    const value = safeRead(detail, key);

    if (typeof value === "string") {
      safe[key] = value;
    }
  }

  const status = safeRead(detail, "status");

  if (Number.isInteger(status) || typeof status === "string") {
    safe.status = status;
  }

  return safe;
}

function diagnostic(error, operation) {
  const detail = safeDetail(safeRead(error, "detail"));
  const kind = safeRead(error, "kind");

  return {
    kind: typeof kind === "string" ? kind : "unknown",
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
  const inFlight = new Map();

  function load(asset) {
    const activeRequest = inFlight.get(asset.id);

    if (activeRequest) {
      return activeRequest;
    }

    const request = performLoad(asset).finally(() => {
      if (inFlight.get(asset.id) === request) {
        inFlight.delete(asset.id);
      }
    });

    inFlight.set(asset.id, request);
    return request;
  }

  async function performLoad(asset) {
    const adapter = safeRead(adapters, asset.exchange.toLowerCase());
    const version = asset.version + 1;
    asset.version = version;
    asset.status = "loading";
    asset.error = null;
    asset.diagnostics = [];

    if (!adapter) {
      asset.status = "error";
      asset.error = "Some asset data could not be loaded.";
      asset.diagnostics = [
        { kind: "configuration", operation: "loadAsset" },
      ];
      return clone(asset);
    }

    const [tickerResult, candlesResult] = await Promise.allSettled([
      Promise.resolve().then(() => adapter.fetchTicker(asset.symbol)),
      Promise.resolve().then(() => adapter.fetchCandles(asset.symbol)),
    ]);
    const next = {
      ticker: asset.ticker,
      analysis: asset.analysis,
      modeResults: asset.modeResults,
      diagnostics: [],
    };

    if (tickerResult.status === "fulfilled") {
      next.ticker = tickerResult.value;
    } else {
      next.diagnostics.push(diagnostic(tickerResult.reason, "fetchTicker"));
    }

    if (candlesResult.status === "fulfilled") {
      try {
        next.analysis = analyzeCandles(candlesResult.value);
        next.modeResults = classifyModes(next.analysis);
      } catch (error) {
        next.diagnostics.push(diagnostic(error, "analyzeCandles"));
      }
    } else {
      next.diagnostics.push(diagnostic(candlesResult.reason, "fetchCandles"));
    }

    if (assets.get(asset.id) !== asset || asset.version !== version) {
      return null;
    }

    Object.assign(asset, next);
    asset.status = next.diagnostics.length === 0 ? "ready" : "error";
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
        version: 0,
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
