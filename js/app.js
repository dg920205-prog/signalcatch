import { fetchBinanceCandles, fetchBinanceTicker } from "./api/binance.js";
import { fetchBybitCandles, fetchBybitHistory, fetchBybitTicker } from "./api/bybit.js";
import { createMarketProfileLoader } from "./analysis/market-profile.js";
import { buildRecommendation } from "./analysis/recommendation.js";
import { runBacktest } from "./backtest/engine.js";
import { groupSummaries, summarizeTrades } from "./backtest/metrics.js";
import { buildModeJobs, partitionOosTrades, presetDateWindow, selectBybitSymbols } from "./backtest/workflow.js";
import { MODE_CONFIG } from "./config.js";
import { createManualAssetService } from "./services/manual-assets.js";
import { createScannerService } from "./services/scanner.js";
import { buildBacktestRequest, exportBacktestCsv, renderBacktestMetrics, renderExecutionCard, renderGroupedByMode, renderGroupedBySymbol, renderTrades } from "./ui/backtest-view.js";
import { activateTab, bindTabs, renderSummary, setApiStatus } from "./ui/dashboard.js";
import { dom } from "./ui/dom.js";
import { renderManualAssets } from "./ui/manual-assets.js";
import { renderScannerProgress, renderScannerResults } from "./ui/scanner.js";

const modeByTab = {
  manual: "common",
  scanner: "day",
  backtest: "daily",
  auxiliary: "swing",
};

const elements = {
  apiStatus: document.querySelector("#api-status"),
  lastRefresh: document.querySelector("#last-refresh"),
  summaryGrid: document.querySelector("#summary-grid"),
  manualForm: document.querySelector("#manual-form"),
  manualGrid: document.querySelector("#manual-grid"),
  dialog: document.querySelector("#settings-dialog"),
  openSettings: document.querySelector("#settings-open"),
  closeSettings: document.querySelector("#settings-close"),
  backtestDays: document.querySelector("#backtest-days"),
  backtestSymbols: document.querySelector("#backtest-symbols"),
  backtestForm: document.querySelector("#backtest-form"),
  backtestRunCard: document.querySelector("#backtest-run-card"),
  backtestMetrics: document.querySelector("#backtest-metrics"),
  symbolSummary: document.querySelector("#symbol-summary"),
  modeSummary: document.querySelector("#mode-summary"),
  tradeResults: document.querySelector("#trade-results"),
  exportCsv: document.querySelector("#export-csv"),
  scannerRun: document.querySelector("#scanner-run"),
  scannerProgress: document.querySelector("#scanner-progress"),
  scannerResults: document.querySelector("#scanner-results"),
};

const marketProfileById = new Map();
const marketProfileLoader = createMarketProfileLoader();
const adapters = {
  bybit: {
    fetchTicker: fetchBybitTicker,
    fetchCandles: (symbol) =>
      fetchBybitCandles(symbol, { interval: MODE_CONFIG.common.interval, limit: 250 }),
  },
  binance: {
    fetchTicker: fetchBinanceTicker,
    fetchCandles: (symbol) => fetchBinanceCandles(symbol, { interval: "1h", limit: 250 }),
  },
};
const manualService = createManualAssetService(adapters);
const scannerService = createScannerService({
  bybit: {
    fetchCandles: (symbol, { signal } = {}) =>
      fetchBybitCandles(symbol, { interval: MODE_CONFIG.common.interval, limit: 250, signal }),
  },
});
let lastTrades = [];
let lastScannerCandidates = [];

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function updateSummary(assets = [], tradeCount = 0) {
  renderSummary(
    elements.summaryGrid,
    {
      manualAssets: assets.length,
      scannerResults: lastScannerCandidates.length,
      backtestTrades: tradeCount,
    },
    { dom },
  );
}

function enrichAssets(rawAssets) {
  const activeTab =
    document
      .querySelector("[data-tab][aria-selected='true']")
      ?.getAttribute("data-tab") ?? "manual";
  const mode = modeByTab[activeTab] ?? "common";
  return rawAssets.map((asset) => {
    const marketProfile = marketProfileById.get(asset.id) ?? { source: "fallback" };
    return {
      ...asset,
      recommendation: buildRecommendation({
        analysis: asset.analysis,
        modeResults: asset.modeResults,
        mode,
        marketProfile,
      }),
    };
  });
}

function rerender() {
  const assets = enrichAssets(manualService.list());
  renderManualAssets(elements.manualGrid, assets, { dom });
  updateSummary(assets, lastTrades.length);
  dom.setText(elements.lastRefresh, nowIso());
}

async function addManualAsset(form) {
  const formData = new FormData(form);
  const symbol = String(formData.get("symbol") ?? "");
  const exchange = String(formData.get("exchange") ?? "bybit");
  setApiStatus(elements.apiStatus, "loading", { dom });
  try {
    const asset = await manualService.add({ symbol, exchange });
    marketProfileById.set(asset.id, await marketProfileLoader.load(asset.symbol));
    setApiStatus(elements.apiStatus, "ready", { dom });
    rerender();
  } catch {
    setApiStatus(elements.apiStatus, "error", { dom });
    rerender();
  }
}

function readBacktestFormState() {
  const formData = new FormData(elements.backtestForm);
  const manualSymbols = selectBybitSymbols(manualService.list());
  const typedSymbols = String(formData.get("symbols") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const selected = typedSymbols.length > 0 ? typedSymbols : manualSymbols;
  return {
    symbols: manualSymbols.length ? manualSymbols : selected,
    selected,
    modes: Object.keys(MODE_CONFIG),
    startDate: String(formData.get("startDate") ?? ""),
    endDate: String(formData.get("endDate") ?? ""),
    roundTripFeePct: String(formData.get("roundTripFeePct") ?? "0.11"),
    roundTripSlippagePct: String(formData.get("roundTripSlippagePct") ?? "0.2"),
    waitCandles: {
      common: String(formData.get("waitCommon") ?? MODE_CONFIG.common.waitCandles),
      scalp: String(formData.get("waitScalp") ?? MODE_CONFIG.scalp.waitCandles),
      day: String(formData.get("waitDay") ?? MODE_CONFIG.day.waitCandles),
      daily: String(formData.get("waitDaily") ?? MODE_CONFIG.daily.waitCandles),
      swing: String(formData.get("waitSwing") ?? MODE_CONFIG.swing.waitCandles),
    },
  };
}

async function runBacktestFlow() {
  setApiStatus(elements.apiStatus, "loading", { dom });
  try {
    const request = buildBacktestRequest(readBacktestFormState());
    const startMs = new Date(`${request.startDate}T00:00:00Z`).getTime();
    const endMs = new Date(`${request.endDate}T23:59:59Z`).getTime();
    const trades = [];
    let inSampleTrades = 0;
    let outSampleTrades = 0;
    const inSample = [];
    const outOfSample = [];

    for (const symbol of request.symbols) {
      const jobs = buildModeJobs(
        request.modes,
        Object.fromEntries(
          Object.entries(MODE_CONFIG).map(([mode, config]) => [
            mode,
            { ...config, waitCandles: request.waitCandles[mode] },
          ]),
        ),
      );
      for (const { mode, interval, waitCandles } of jobs) {
        const candles = await fetchBybitHistory(symbol, {
          interval,
          start: startMs,
          end: endMs,
          limit: 500,
        });
        const modeTrades = runBacktest({
          candles,
          symbol,
          mode,
          waitCandles,
          feePct: request.roundTripFeePct,
          slippagePct: request.roundTripSlippagePct,
        });
        const partition = partitionOosTrades(modeTrades, candles.length);
        inSample.push(...partition.inSample);
        outOfSample.push(...partition.outOfSample);
        trades.push(...partition.inSample, ...partition.outOfSample);
      }
    }
    inSampleTrades = inSample.length;
    outSampleTrades = outOfSample.length;

    lastTrades = trades;
    const summary = summarizeTrades(trades);
    renderBacktestMetrics(elements.backtestMetrics, summary, { dom });
    renderGroupedBySymbol(elements.symbolSummary, groupSummaries(trades, "symbol"), { dom });
    renderGroupedByMode(elements.modeSummary, groupSummaries(trades, "mode"), { dom });
    renderTrades(elements.tradeResults, trades, { dom });

    const sources = new Set(
      request.symbols
        .map((symbol) => marketProfileById.get(`bybit:${symbol}`)?.source ?? "fallback"),
    );
    renderExecutionCard(
      elements.backtestRunCard,
      {
        startDate: request.startDate,
        endDate: request.endDate,
        symbolsText: request.symbols.join(", "),
        modesText: request.modes.join(", "),
        dataSource: sources.has("full") ? "전체 데이터 반영" : "Bybit 기준 임시 산정",
        oosLabel: `In ${inSampleTrades} / OOS ${outSampleTrades}`,
        oosMetrics: summarizeTrades(outOfSample),
      },
      { dom },
    );
    setApiStatus(elements.apiStatus, "ready", { dom });
    rerender();
  } catch {
    setApiStatus(elements.apiStatus, "error", { dom });
  }
}

async function runScannerFlow() {
  setApiStatus(elements.apiStatus, "loading", { dom });
  renderScannerProgress(elements.scannerProgress, { completed: 0, total: 0 }, { dom });
  try {
    const symbols = manualService.list().map((asset) => asset.symbol);
    const universe = symbols.length
      ? symbols
      : ["BTC", "ETH", "SOL", "XRP", "HBAR", "ADA", "DOGE"];
    const candidates = await scannerService.run({
      symbols: universe,
      onProgress: ({ completed, total }) =>
        renderScannerProgress(elements.scannerProgress, { completed, total }, { dom }),
    });
    lastScannerCandidates = candidates;
    renderScannerResults(elements.scannerResults, candidates, {
      dom,
      onBacktest: runScannerCandidateBacktest,
    });
    setApiStatus(elements.apiStatus, "ready", { dom });
    rerender();
  } catch {
    setApiStatus(elements.apiStatus, "error", { dom });
  }
}

async function runScannerCandidateBacktest(symbol) {
  elements.backtestSymbols.value = symbol;
  if (
    !elements.backtestForm.elements.startDate.value ||
    !elements.backtestForm.elements.endDate.value
  ) {
    const { startDate, endDate } = presetDateWindow(Number(elements.backtestDays.value));
    elements.backtestForm.elements.startDate.value = startDate;
    elements.backtestForm.elements.endDate.value = endDate;
  }
  activateTab("backtest");
  elements.backtestSymbols.focus();
  await runBacktestFlow();
}

function bindDialog() {
  elements.openSettings.addEventListener("click", () => elements.dialog.showModal());
  elements.closeSettings.addEventListener("click", () => elements.dialog.close());
}

function bindBacktestPresets() {
  for (const button of document.querySelectorAll("[data-preset-days]")) {
    button.addEventListener("click", () => {
      const days = Number(button.getAttribute("data-preset-days"));
      const { startDate, endDate } = presetDateWindow(days);
      elements.backtestDays.value = String(days);
      elements.backtestForm.elements.startDate.value = startDate;
      elements.backtestForm.elements.endDate.value = endDate;
    });
  }
}

function bindManualForm() {
  elements.manualForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await addManualAsset(elements.manualForm);
    elements.manualForm.reset();
  });
}

function bindBacktestForm() {
  elements.backtestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runBacktestFlow();
  });
  elements.exportCsv.addEventListener("click", () => {
    const csv = exportBacktestCsv(lastTrades);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `signalcatch-backtest-${Date.now()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  });
}

function bindScanner() {
  elements.scannerRun.addEventListener("click", async () => {
    await runScannerFlow();
  });
}

bindTabs();
bindDialog();
bindBacktestPresets();
bindManualForm();
bindBacktestForm();
bindScanner();
setApiStatus(elements.apiStatus, "idle", { dom });
rerender();
