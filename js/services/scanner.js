import { analyzeCandles, classifyModes } from "../analysis/signals.js";
import { buildRecommendation } from "../analysis/recommendation.js";
import { normalizeBaseSymbol } from "../core/symbols.js";
import { MODE_CONFIG, TREND_GATING } from "../config.js";
import { computeTrendState, applyTrendMultiplier, applyStructureMultiplier, applyCvdMultiplier } from "../analysis/trend-gating.js";
import { computeStructureState } from "../analysis/structure.js";
import { computeCvdState } from "../analysis/cvd.js";

const MODES = ["common", "scalp", "day", "daily", "swing"];

function clone(value) {
  return structuredClone(value);
}

function abortError() {
  return new DOMException("Scanner run aborted.", "AbortError");
}

function safeRead(value, key) {
  try {
    return value?.[key];
  } catch {
    return undefined;
  }
}

function throwIfAborted(signal) {
  if (safeRead(signal, "aborted")) {
    throw abortError();
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

function diagnostic(error) {
  const detail = safeDetail(safeRead(error, "detail"));
  const kind = safeRead(error, "kind");

  return {
    kind: typeof kind === "string" ? kind : "unknown",
    ...detail,
    operation: detail.operation ?? "fetchCandles",
  };
}

function normalizeSymbols(symbols, maxSymbols) {
  let isArray = false;

  try {
    isArray = Array.isArray(symbols);
  } catch {
    // Revoked proxies and hostile collections are not valid scanner input.
  }

  if (!isArray) {
    throw new Error("Scanner symbols must be an array.");
  }

  const normalized = [];
  const seen = new Set();

  for (let index = 0; index < maxSymbols; index += 1) {
    let symbol;

    try {
      symbol = symbols[index];
    } catch {
      continue;
    }

    if (symbol === undefined) {
      continue;
    }

    try {
      const normalizedSymbol = normalizeBaseSymbol(symbol);

      if (!seen.has(normalizedSymbol)) {
        seen.add(normalizedSymbol);
        normalized.push(normalizedSymbol);
      }
    } catch {
      // Invalid symbols are isolated so other scan candidates can continue.
    }
  }

  return normalized;
}

export function createScannerService({
  bybit,
  concurrency = 4,
  maxSymbols = 100,
  analyze = analyzeCandles,
  signalClassify = classifyModes,
}) {
  if (
    !bybit ||
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 10
  ) {
    throw new Error("Invalid scanner configuration.");
  }

  if (!Number.isInteger(maxSymbols) || maxSymbols < 1 || maxSymbols > 500) {
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

        const normalizedSymbols = normalizeSymbols(symbols, maxSymbols);
        let btcContext = null;
        if (bybit.fetchHtfCandles) {
          try {
            const btcCandles = await Promise.resolve().then(() =>
              bybit.fetchHtfCandles(
                TREND_GATING.btcSymbol,
                TREND_GATING.btcHtfInterval,
                { signal },
              ),
            );
            throwIfAborted(signal);
            const btcStateResult = computeTrendState({
              candles: btcCandles,
              longEmaPeriod: TREND_GATING.btcHtfLongEmaPeriod,
              shortEmaPeriod: TREND_GATING.btcHtfShortEmaPeriod,
            });
            btcContext = { state: btcStateResult.state };
          } catch (error) {
            if (
              safeRead(error, "name") === "AbortError" ||
              safeRead(signal, "aborted")
            ) {
              throw abortError();
            }
            btcContext = null;
          }
        }
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
              const sharedCandles = bybit.fetchModeCandles
                ? null
                : await Promise.resolve().then(() =>
                    bybit.fetchCandles(symbol, { signal }),
                  );
              const ticker = bybit.fetchTicker
                ? await Promise.resolve().then(() => bybit.fetchTicker(symbol))
                : null;
              const setups = {};
              const htfCache = new Map();
              const isBtc = symbol === TREND_GATING.btcSymbol;
              for (const mode of MODES) {
                const candles = sharedCandles ?? await Promise.resolve().then(() =>
                  bybit.fetchModeCandles(symbol, mode, { signal }),
                );
                const modeAnalysis = analyze(candles);
                let finalAnalysis = modeAnalysis;
                let trendGatingOutput = null;
                let structureGatingOutput = null;
                let cvdGatingOutput = null;

                if (bybit.fetchHtfCandles) {
                  const modeConfig = MODE_CONFIG[mode];
                  const htfInterval = modeConfig?.htfInterval;
                  if (htfInterval) {
                    if (!htfCache.has(htfInterval)) {
                      try {
                        const htfCandles = await Promise.resolve().then(() =>
                          bybit.fetchHtfCandles(symbol, htfInterval, { signal }),
                        );
                        htfCache.set(htfInterval, htfCandles);
                      } catch (error) {
                        if (
                          safeRead(error, "name") === "AbortError" ||
                          safeRead(signal, "aborted")
                        ) {
                          throw abortError();
                        }
                        htfCache.set(htfInterval, null);
                      }
                    }
                    const htfCandles = htfCache.get(htfInterval);
                    if (htfCandles) {
                      const stateResult = computeTrendState({
                        candles: htfCandles,
                        longEmaPeriod: modeConfig.htfLongEmaPeriod,
                        shortEmaPeriod: modeConfig.htfShortEmaPeriod,
                      });
                      const btcCtxForMode = btcContext
                        ? { ...btcContext, isBtc }
                        : null;
                      finalAnalysis = applyTrendMultiplier(
                        modeAnalysis,
                        stateResult.state,
                        btcCtxForMode,
                      );
                      trendGatingOutput = {
                        state: stateResult.state,
                        multiplier: finalAnalysis.trendMultiplier ?? 1.0,
                        btcOverlayApplied:
                          finalAnalysis.btcOverlayApplied ?? false,
                      };
                      const structureResult = computeStructureState({
                        candles: htfCandles,
                      });
                      finalAnalysis = applyStructureMultiplier(
                        finalAnalysis,
                        structureResult.state,
                      );
                      structureGatingOutput = {
                        state: structureResult.state,
                        multiplier: finalAnalysis.structureMultiplier ?? 1.0,
                      };
                      const cvdResult = computeCvdState({
                        candles: htfCandles,
                      });
                      finalAnalysis = applyCvdMultiplier(
                        finalAnalysis,
                        cvdResult.state,
                      );
                      cvdGatingOutput = {
                        state: cvdResult.state,
                        multiplier: finalAnalysis.cvdMultiplier ?? 1.0,
                      };
                    } else {
                      trendGatingOutput = {
                        state: "insufficient_data",
                        multiplier: 1.0,
                        btcOverlayApplied: false,
                      };
                      structureGatingOutput = {
                        state: "unknown",
                        multiplier: 1.0,
                      };
                      cvdGatingOutput = {
                        state: "insufficient_data",
                        multiplier: 1.0,
                      };
                    }
                  }
                }

                const modeResults = signalClassify(finalAnalysis);
                const recommendation = buildRecommendation({
                  analysis: finalAnalysis,
                  modeResults,
                  mode,
                });
                setups[mode] = {
                  mode,
                  direction: finalAnalysis.direction,
                  analysis: finalAnalysis,
                  plan: recommendation.plan,
                  recommendation,
                  trendGating: trendGatingOutput,
                  structureGating: structureGatingOutput,
                  cvdGating: cvdGatingOutput,
                };
              }
              throwIfAborted(signal);
              const analysis = setups.common.analysis;
              candidates[index] = {
                symbol,
                exchange: "Bybit",
                status: "ready",
                error: null,
                diagnostics: [],
                price: ticker?.price ?? analysis.close ?? null,
                analysis,
                modeResults: signalClassify(analysis),
                setups,
              };
            } catch (error) {
              if (
                safeRead(error, "name") === "AbortError" ||
                safeRead(signal, "aborted")
              ) {
                throw abortError();
              }

              candidates[index] = {
                symbol,
                exchange: "Bybit",
                status: "error",
                error: "Some scanner data could not be loaded.",
                diagnostics: [diagnostic(error)],
                analysis: null,
                modeResults: signalClassify(),
              };
            }

            completed += 1;

            try {
              onProgress?.({ completed, total: normalizedSymbols.length, symbol });
            } catch {
              // Consumer progress reporting must not interrupt a scanner run.
            }
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
