import { analyzeCandles, classifyModes } from "../analysis/signals.js";
import { normalizeBaseSymbol } from "../core/symbols.js";

function clone(value) {
  return structuredClone(value);
}

function abortError() {
  return new DOMException("Scanner run aborted.", "AbortError");
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw abortError();
  }
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

function diagnostic(error) {
  const detail = safeDetail(error?.detail);

  return {
    kind: typeof error?.kind === "string" ? error.kind : "unknown",
    ...detail,
    operation: detail.operation ?? "fetchCandles",
  };
}

export function createScannerService({
  bybit,
  concurrency = 4,
  maxSymbols = 100,
  analyze = analyzeCandles,
  signalClassify = classifyModes,
}) {
  if (!bybit || !Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("Invalid scanner configuration.");
  }

  if (!Number.isInteger(maxSymbols) || maxSymbols < 1) {
    throw new Error("Invalid scanner configuration.");
  }

  let running = false;

  return {
    async run({ symbols = [], onProgress, signal } = {}) {
      if (running) {
        throw new Error("Scanner is already running.");
      }

      running = true;

      try {
        throwIfAborted(signal);

        const normalizedSymbols = [
          ...new Set(symbols.map((symbol) => normalizeBaseSymbol(symbol))),
        ].slice(0, maxSymbols);
        const candidates = new Array(normalizedSymbols.length);
        let nextIndex = 0;
        let completed = 0;

        async function worker() {
          while (true) {
            throwIfAborted(signal);

            const index = nextIndex;
            nextIndex += 1;

            if (index >= normalizedSymbols.length) {
              return;
            }

            const symbol = normalizedSymbols[index];

            try {
              const candles = await bybit.fetchCandles(symbol, { signal });
              throwIfAborted(signal);
              const analysis = analyze(candles);
              candidates[index] = {
                symbol,
                exchange: "Bybit",
                status: "ready",
                diagnostics: [],
                analysis,
                modeResults: signalClassify(analysis),
              };
            } catch (error) {
              if (error?.name === "AbortError" || signal?.aborted) {
                throw abortError();
              }

              candidates[index] = {
                symbol,
                exchange: "Bybit",
                status: "error",
                diagnostics: [diagnostic(error)],
                analysis: null,
                modeResults: signalClassify(),
              };
            }

            completed += 1;
            onProgress?.({ completed, total: normalizedSymbols.length, symbol });
          }
        }

        const workerResults = await Promise.allSettled(
          Array.from({ length: Math.min(concurrency, normalizedSymbols.length) }, () =>
            worker(),
          ),
        );
        throwIfAborted(signal);

        const rejectedWorker = workerResults.find(
          ({ status }) => status === "rejected",
        );

        if (rejectedWorker) {
          throw rejectedWorker.reason;
        }

        return clone(candidates);
      } finally {
        running = false;
      }
    },
  };
}
