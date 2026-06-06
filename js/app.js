import { fetchBinanceCandles, fetchBinanceTicker } from "./api/binance.js";
import { dropUnclosedCandle, fetchBybitCandles, fetchBybitHistory, fetchBybitMarketTickers, fetchBybitTicker, fetchBybitTopSymbols, searchBybitSymbols } from "./api/bybit.js";
import { createMarketProfileLoader } from "./analysis/market-profile.js";
import { buildRecommendation } from "./analysis/recommendation.js";
import { runBacktest } from "./backtest/engine.js";
import { groupSummaries, summarizeTrades } from "./backtest/metrics.js";
import { buildModeJobs, partitionOosTrades, presetDateWindow, selectBybitSymbols } from "./backtest/workflow.js";
import { MODE_CONFIG } from "./config.js";
import { createManualAssetService } from "./services/manual-assets.js";
import { createManualSearchService } from "./services/manual-search.js";
import { createMarketService } from "./services/market.js";
import { createScannerService } from "./services/scanner.js";
import { createScannerSearchService } from "./services/scanner-search.js";
import { createStorage } from "./storage.js";
import { buildBacktestRequest, downloadBacktestCsv, renderBacktestMetrics, renderEquityCurve, renderExecutionCard, renderGroupedByMode, renderGroupedBySymbol, renderTrades } from "./ui/backtest-view.js";
import { activateTab, bindTabs, renderSummary, setApiStatus } from "./ui/dashboard.js";
import { dom } from "./ui/dom.js";
import { renderManualAssets } from "./ui/manual-assets.js";
import { renderDashboardContext } from "./ui/dashboard-context.js";
import { renderMarketDetail, renderMarketHeatmap } from "./ui/market.js";
import { tradingViewReferenceUrl } from "./ui/tradingview.js";
import { renderScannerProgress, renderScannerResults } from "./ui/scanner.js";

const elements = {
  apiStatus: document.querySelector("#api-status"),
  lastRefresh: document.querySelector("#last-refresh"),
  summaryGrid: document.querySelector("#summary-grid"),
  dashboardContext: document.querySelector("#dashboard-context"),
  onboardingBanner: document.querySelector("#onboarding-banner"),
  onboardingClose: document.querySelector("#onboarding-close"),
  manualForm: document.querySelector("#manual-form"),
  manualSearchResult: document.querySelector("#manual-search-result"),
  manualGrid: document.querySelector("#manual-grid"),
  recommendationMode: document.querySelector("#recommendation-mode"),
  dialog: document.querySelector("#settings-dialog"),
  openSettings: document.querySelector("#settings-open"),
  closeSettings: document.querySelector("#settings-close"),
  persistSettings: document.querySelector("input[name='persist']"),
  exportButton: document.querySelector("#settings-export"),
  importTrigger: document.querySelector("#settings-import-trigger"),
  importFile: document.querySelector("#settings-import-file"),
  importStatus: document.querySelector("#settings-import-status"),
  returnToMarket: document.querySelector("#backtest-return-market"),
  backtestDays: document.querySelector("#backtest-days"),
  backtestSymbols: document.querySelector("#backtest-symbols"),
  backtestForm: document.querySelector("#backtest-form"),
  backtestRunCard: document.querySelector("#backtest-run-card"),
  backtestMetrics: document.querySelector("#backtest-metrics"),
  equityChart: document.querySelector("#equity-chart"),
  symbolSummary: document.querySelector("#symbol-summary"),
  modeSummary: document.querySelector("#mode-summary"),
  tradeResults: document.querySelector("#trade-results"),
  exportCsv: document.querySelector("#export-csv"),
  scannerRun: document.querySelector("#scanner-run"),
  scannerSearchForm: document.querySelector("#scanner-search-form"),
  scannerSearchStatus: document.querySelector("#scanner-search-status"),
  scannerLimit: document.querySelector("#scanner-limit"),
  scannerProgress: document.querySelector("#scanner-progress"),
  scannerResults: document.querySelector("#scanner-results"),
  marketRefresh: document.querySelector("#market-refresh"),
  marketHeatmap: document.querySelector("#market-heatmap"),
  marketDetail: document.querySelector("#market-detail"),
};

const storage = createStorage(window.localStorage);
let savedSettings = storage.load();
if (savedSettings.ui.selectedMode) {
  elements.recommendationMode.value = savedSettings.ui.selectedMode;
}
if (elements.persistSettings) {
  elements.persistSettings.checked = savedSettings.persist;
}

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
const manualSearchService = createManualSearchService({
  searchSymbols: searchBybitSymbols,
  addAsset: ({ symbol, exchange }) => manualService.add({ symbol, exchange }),
});
const scannerService = createScannerService({
  bybit: {
    fetchTicker: fetchBybitTicker,
    fetchCandles: (symbol, { signal } = {}) =>
      fetchBybitCandles(symbol, { interval: MODE_CONFIG.common.interval, limit: 250, signal }),
    fetchModeCandles: (symbol, mode, { signal } = {}) =>
      fetchBybitCandles(symbol, { interval: MODE_CONFIG[mode].interval, limit: 250, signal }),
    fetchHtfCandles: (symbol, htfInterval, { signal } = {}) =>
      fetchBybitCandles(symbol, { interval: htfInterval, limit: 600, signal }),
    fetchZoneCandles: async (symbol, zoneInterval, { signal } = {}) =>
      dropUnclosedCandle(
        await fetchBybitCandles(symbol, { interval: zoneInterval, limit: 251, signal }),
      ),
  },
});
const marketService = createMarketService({
  bybit: {
    fetchMarketTickers: fetchBybitMarketTickers,
    fetchCandles: fetchBybitCandles,
  },
});
let lastTrades = [];
let lastScannerCandidates = [];
let selectedMarketSymbol = null;
let pendingManualSearch = null;
let lastRefreshIso = "";
const scannerSearchService = createScannerSearchService({
  searchSymbols: searchBybitSymbols,
  scanSymbols: (symbols) => scannerService.run({ symbols }),
  getCandidates: () => lastScannerCandidates,
});

function nowIso() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function updateSummary(assets = []) {
  const recommendedCount = assets.filter((asset) =>
    asset?.recommendation?.quality === "recommended",
  ).length;
  renderSummary(
    elements.summaryGrid,
    {
      manualAssets: assets.length,
      scannerResults: lastScannerCandidates.length,
      recommendedCount,
      lastRefreshIso,
    },
    { dom },
  );
}

function enrichAssets(rawAssets) {
  const mode = elements.recommendationMode.value;
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
  updateSummary(assets);
}

function handleScannerBacktestSelect(symbol) {
  if (typeof symbol !== "string") return;
  activateTab("backtest");
  if (elements.backtestSymbols) {
    elements.backtestSymbols.value = symbol;
    elements.backtestSymbols.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  saveUiState({ activeTab: "backtest" });
}

function markRefreshed() {
  lastRefreshIso = new Date().toISOString();
  dom.setText(elements.lastRefresh, nowIso());
}

async function addManualAsset(form) {
  const searchResult = pendingManualSearch;
  if (!searchResult) return;
  setApiStatus(elements.apiStatus, "loading", { dom });
  try {
    const asset = await manualSearchService.confirm(searchResult);
    marketProfileById.set(asset.id, await marketProfileLoader.load(asset.symbol));
    markRefreshed();
    pendingManualSearch = null;
    dom.clear(elements.manualSearchResult);
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
    renderEquityCurve(elements.equityChart, trades, { dom });
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
  let usedFallback = false;
  try {
    const limit = Number(elements.scannerLimit.value);
    let universe;
    try {
      universe = await fetchBybitTopSymbols({ limit });
    } catch {
      usedFallback = true;
      universe = ["BTC", "ETH", "SOL", "XRP", "HBAR", "ADA", "DOGE"];
    }
    const candidates = await scannerService.run({
      symbols: universe,
      onProgress: ({ completed, total }) =>
        renderScannerProgress(elements.scannerProgress, { completed, total }, { dom }),
    });
    lastScannerCandidates = candidates;
    markRefreshed();
    renderScannerResults(elements.scannerResults, candidates, {
      dom,
      onBacktestSelect: handleScannerBacktestSelect,
    });
    setApiStatus(elements.apiStatus, usedFallback ? "error" : "ready", { dom });
    rerender();
  } catch {
    setApiStatus(elements.apiStatus, "error", { dom });
  }
}

async function runScannerSearch(form) {
  const symbol = String(new FormData(form).get("symbol") ?? "");
  dom.setText(elements.scannerSearchStatus, "종목을 확인하고 있습니다.");
  try {
    const result = await scannerSearchService.search(symbol);
    if (result.kind === "unsupported") {
      dom.setText(elements.scannerSearchStatus, `${result.symbol}: Bybit 미지원 종목`);
      return;
    }
    if (result.kind === "analysis-error") {
      dom.setText(elements.scannerSearchStatus, `${result.symbol}: 분석 결과를 불러오지 못했습니다.`);
      return;
    }
    if (result.kind === "added") {
      lastScannerCandidates = [
        ...lastScannerCandidates.filter((candidate) => candidate.symbol !== result.symbol),
        result.candidate,
      ];
      markRefreshed();
    }
    renderScannerResults(elements.scannerResults, [result.candidate], {
      dom,
      onBacktestSelect: handleScannerBacktestSelect,
    });
    dom.setText(
      elements.scannerSearchStatus,
      result.kind === "existing"
        ? `${result.symbol}: 기존 스캔 결과를 표시합니다.`
        : `${result.symbol}: 즉시 분석 결과를 추가했습니다.`,
    );
    rerender();
  } catch {
    dom.setText(elements.scannerSearchStatus, "종목 검색 중 API 오류가 발생했습니다.");
  }
}

async function verifyManualAsset(form) {
  const formData = new FormData(form);
  const symbol = String(formData.get("symbol") ?? "");
  const exchange = String(formData.get("exchange") ?? "bybit");
  dom.setText(elements.manualSearchResult, "종목을 확인하고 있습니다.");
  pendingManualSearch = null;
  try {
    const result = await manualSearchService.verify({ symbol, exchange });
    if (result.kind === "unsupported") {
      dom.setText(elements.manualSearchResult, `${result.symbol}: Bybit 미지원 종목`);
      return;
    }
    pendingManualSearch = result;
    dom.clear(elements.manualSearchResult);
    dom.append(
      elements.manualSearchResult,
      dom.el("div", { class: "verified-result" },
        dom.el("strong", {}, `${result.symbol} / ${result.exchange.toUpperCase()}`),
        dom.el("button", { type: "button", onClick: () => addManualAsset(form) }, "분석 추가"),
      ),
    );
  } catch {
    dom.setText(elements.manualSearchResult, "종목 확인 중 API 오류가 발생했습니다.");
  }
}

function bindDialog() {
  elements.openSettings.addEventListener("click", () => elements.dialog.showModal());
  elements.closeSettings.addEventListener("click", () => elements.dialog.close());
  elements.returnToMarket.addEventListener("click", () => {
    if (activateTab("market")) saveUiState({ activeTab: "market" });
  });
  elements.persistSettings.addEventListener("change", () => saveUiState());
  elements.exportButton?.addEventListener("click", () => {
    // persist 상태와 무관하게 현재 인메모리 데이터를 백업하기 위해
    // 일시적으로 persist=true 로 강제 저장 후 원복
    const wasPersist = elements.persistSettings.checked;
    elements.persistSettings.checked = true;
    saveUiState();
    const data = storage.exportSettings();
    elements.persistSettings.checked = wasPersist;
    if (!wasPersist) {
      storage.clear();
    }

    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.href = url;
    a.download = `signalcatch-backup-${ymd}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  elements.importTrigger?.addEventListener("click", () => elements.importFile?.click());

  elements.importFile?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const ok = storage.importSettings(text);
      if (ok) {
        dom.setText(elements.importStatus, "복원 성공. 페이지를 새로고침합니다.");
        setTimeout(() => location.reload(), 600);
      } else {
        dom.setText(elements.importStatus, "백업 파일을 읽을 수 없습니다.");
      }
    } catch {
      dom.setText(elements.importStatus, "백업 파일을 읽을 수 없습니다.");
    } finally {
      event.target.value = "";
    }
  });
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
    await verifyManualAsset(elements.manualForm);
  });
}

function bindRecommendationMode() {
  elements.recommendationMode.addEventListener("change", () => {
    rerender();
    saveUiState({ selectedMode: elements.recommendationMode.value });
  });
}

function activeTab() {
  return document.querySelector("[data-tab].is-active")?.getAttribute("data-tab") ?? "manual";
}

function saveUiState(nextUi = {}) {
  const persist = elements.persistSettings.checked;
  const ui = {
    ...savedSettings.ui,
    activeTab: activeTab(),
    selectedMode: elements.recommendationMode.value,
    ...nextUi,
  };
  const manualAssets = manualService.list().map((asset) => ({
    symbol: asset.symbol,
    exchange: asset.exchange,
  }));
  savedSettings = { ...savedSettings, persist, manualAssets, ui };
  storage.save(savedSettings);
}

function bindBacktestForm() {
  elements.backtestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runBacktestFlow();
  });
  elements.exportCsv.addEventListener("click", () => {
    downloadBacktestCsv(lastTrades);
  });
}

function bindScanner() {
  elements.scannerRun.addEventListener("click", async () => {
    await runScannerFlow();
  });
  elements.scannerSearchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runScannerSearch(elements.scannerSearchForm);
  });
}

async function refreshMarket() {
  setApiStatus(elements.apiStatus, "loading", { dom });
  try {
    const snapshot = await marketService.refresh();
    renderMarketHeatmap(elements.marketHeatmap, snapshot.themes, {
      dom,
      onSelect: loadMarketDetail,
    });
    setApiStatus(elements.apiStatus, "ready", { dom });
  } catch {
    setApiStatus(elements.apiStatus, "error", { dom });
  }
}

async function loadDashboardContext() {
  try {
    const context = await marketService.loadDashboardContext();
    renderDashboardContext(elements.dashboardContext, context, {
      dom,
      onSelect: (symbol) => {
        const frame = elements.dashboardContext.querySelector?.(".context-reference-chart iframe");
        if (frame) frame.setAttribute("src", tradingViewReferenceUrl(symbol));
      },
    });
  } catch {
    dom.setText(elements.dashboardContext, "시장 방향성을 불러오지 못했습니다.");
  }
}

async function loadMarketDetail(symbol, timeframe = "4H") {
  selectedMarketSymbol = symbol;
  setApiStatus(elements.apiStatus, "loading", { dom });
  try {
    const detail = await marketService.loadDetail(symbol, timeframe);
    renderMarketDetail(elements.marketDetail, detail, {
      dom,
      onTimeframe: (nextTimeframe) => loadMarketDetail(selectedMarketSymbol, nextTimeframe),
    });
    setApiStatus(elements.apiStatus, "ready", { dom });
  } catch {
    setApiStatus(elements.apiStatus, "error", { dom });
  }
}

function bindMarket() {
  elements.marketRefresh.addEventListener("click", refreshMarket);
}

bindTabs(document, {
  initialTab: savedSettings.ui.activeTab,
  onChange: (activeTab) => saveUiState({ activeTab }),
});
bindDialog();
bindBacktestPresets();
bindManualForm();
bindRecommendationMode();
bindBacktestForm();
bindScanner();
bindMarket();
setApiStatus(elements.apiStatus, "idle", { dom });

(async () => {
  for (const stored of savedSettings.manualAssets) {
    try {
      await manualService.add({ symbol: stored.symbol, exchange: stored.exchange });
    } catch { /* 중복/오류 무시 */ }
  }
  if (savedSettings.manualAssets.length > 0) {
    for (const asset of manualService.list()) {
      try {
        marketProfileById.set(asset.id, await marketProfileLoader.load(asset.symbol));
      } catch {}
    }
    markRefreshed();
    rerender();
  }
})();

rerender();

async function runOnboardingIfNeeded() {
  let onboarded = false;
  try { onboarded = localStorage.getItem("signalcatch.onboarded") === "true"; } catch { return; }
  if (onboarded) {
    showOnboardingBannerIfNotClosed();
    return;
  }
  const symbols = ["BTC", "ETH", "SOL"];
  for (const symbol of symbols) {
    try {
      const result = await manualSearchService.verify({ symbol, exchange: "bybit" });
      if (result.kind === "verified") {
        const asset = await manualSearchService.confirm(result);
        if (asset?.id) {
          marketProfileById.set(asset.id, await marketProfileLoader.load(asset.symbol));
        }
      }
    } catch { /* 일부 실패해도 다음 종목 진행 */ }
  }
  try { localStorage.setItem("signalcatch.onboarded", "true"); } catch {}
  markRefreshed();
  rerender();
  showOnboardingBannerIfNotClosed();
}

function showOnboardingBannerIfNotClosed() {
  let closed = false;
  try { closed = localStorage.getItem("signalcatch.onboarding-banner-closed") === "true"; } catch {}
  if (!closed && elements.onboardingBanner) elements.onboardingBanner.hidden = false;
}

elements.onboardingClose?.addEventListener("click", () => {
  if (elements.onboardingBanner) elements.onboardingBanner.hidden = true;
  try { localStorage.setItem("signalcatch.onboarding-banner-closed", "true"); } catch {}
});

runOnboardingIfNeeded();
setInterval(() => {
  updateSummary(enrichAssets(manualService.list()));
}, 30_000);
loadDashboardContext();
