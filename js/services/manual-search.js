import { normalizeBaseSymbol } from "../core/symbols.js";

export function createManualSearchService({ searchSymbols, addAsset } = {}) {
  if (typeof searchSymbols !== "function" || typeof addAsset !== "function") {
    throw new TypeError("Manual search requires adapters.");
  }

  return {
    async verify({ symbol, exchange = "bybit" } = {}) {
      const normalizedSymbol = normalizeBaseSymbol(symbol);
      const normalizedExchange = String(exchange ?? "bybit").trim().toLowerCase();
      if (normalizedExchange === "bybit") {
        try {
          await searchSymbols(normalizedSymbol);
        } catch (error) {
          if (error?.kind === "not-found") {
            return { kind: "unsupported", symbol: normalizedSymbol, exchange: normalizedExchange };
          }
          throw error;
        }
      }
      return { kind: "verified", symbol: normalizedSymbol, exchange: normalizedExchange };
    },

    confirm(result) {
      if (result?.kind !== "verified") {
        throw new Error("Verified manual search result is required.");
      }
      return addAsset({ symbol: result.symbol, exchange: result.exchange });
    },
  };
}
