import { normalizeBaseSymbol } from "../core/symbols.js";

export function createScannerSearchService({
  searchSymbols,
  scanSymbols,
  getCandidates,
} = {}) {
  if (
    typeof searchSymbols !== "function" ||
    typeof scanSymbols !== "function" ||
    typeof getCandidates !== "function"
  ) {
    throw new TypeError("Scanner search requires adapters.");
  }

  return {
    async search(input) {
      const symbol = normalizeBaseSymbol(input);
      try {
        await searchSymbols(symbol);
      } catch (error) {
        if (error?.kind === "not-found") {
          return { kind: "unsupported", symbol };
        }
        throw error;
      }

      const existing = getCandidates().find((candidate) => candidate?.symbol === symbol);
      if (existing) {
        return { kind: "existing", symbol, candidate: existing };
      }

      const [candidate] = await scanSymbols([symbol]);
      return candidate
        ? { kind: "added", symbol, candidate }
        : { kind: "analysis-error", symbol };
    },
  };
}
