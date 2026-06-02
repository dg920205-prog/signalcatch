import {
  buildChartSeries,
  buildMarketBriefing,
  calculateSymbolStrength,
  calculateThemeStrength,
  calculateVolumeChange,
  selectStrongestSetup,
  THEMES,
} from "../analysis/market-heatmap.js";
import { buildRecommendation } from "../analysis/recommendation.js";
import { analyzeCandles, classifyModes } from "../analysis/signals.js";
import { MODE_CONFIG } from "../config.js";
import { normalizeBaseSymbol } from "../core/symbols.js";

const MODES = ["common", "scalp", "day", "daily", "swing"];
const CHART_INTERVALS = { "1H": "60", "4H": "240", "1D": "D" };

function sumVolume(candles) {
  return candles.reduce((sum, candle) =>
    sum + (typeof candle?.volume === "number" && Number.isFinite(candle.volume) ? candle.volume : 0), 0);
}

function volumeProfile(candles) {
  const latest24 = candles.slice(-24);
  const previous24 = candles.slice(-48, -24);
  const latest4 = candles.slice(-4);
  const previous4 = candles.slice(-8, -4);
  return {
    volumeChange24hPct: calculateVolumeChange(sumVolume(latest24), sumVolume(previous24)),
    volumeAcceleration4hPct: calculateVolumeChange(sumVolume(latest4), sumVolume(previous4)),
  };
}

function buildSetups(modeCandles) {
  const setups = {};
  for (const mode of MODES) {
    const analysis = analyzeCandles(modeCandles[mode]);
    const modeResults = classifyModes(analysis);
    const recommendation = buildRecommendation({ analysis, modeResults, mode });
    setups[mode] = { mode, direction: analysis.direction, analysis, plan: recommendation.plan, recommendation };
  }
  return setups;
}

export function createMarketService({ bybit, themes = THEMES, concurrency = 4 } = {}) {
  if (!bybit?.fetchMarketTickers || !bybit?.fetchCandles) {
    throw new TypeError("Market service requires Bybit adapters.");
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new TypeError("Market service concurrency is unsafe.");
  }
  const strengthBySymbol = new Map();

  async function refresh() {
    const tickers = await bybit.fetchMarketTickers();
    const tickerBySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
    const uniqueSymbols = [...new Set(Object.values(themes).flat())];
    const tileBySymbol = new Map();

    let cursor = 0;
    async function worker() {
      while (cursor < uniqueSymbols.length) {
        const symbol = uniqueSymbols[cursor];
        cursor += 1;
      const ticker = tickerBySymbol.get(symbol);
      if (!ticker) {
        tileBySymbol.set(symbol, { symbol, status: "unavailable", score: 0, label: "Neutral" });
          continue;
      }
      try {
        const candles = await bybit.fetchCandles(symbol, { interval: "60", limit: 48 });
        const strength = calculateSymbolStrength({ change24hPct: ticker.change24hPct, ...volumeProfile(candles) });
        strengthBySymbol.set(symbol, strength);
        tileBySymbol.set(symbol, { ...ticker, ...strength, status: "ready" });
      } catch {
        tileBySymbol.set(symbol, { ...ticker, score: 0, label: "Neutral", status: "error" });
      }
      }
    }
    await Promise.all(Array.from(
      { length: Math.min(concurrency, uniqueSymbols.length) },
      () => worker(),
    ));

    return {
      themes: Object.fromEntries(Object.entries(themes).map(([theme, symbols]) => {
        const tiles = symbols.map((symbol) => tileBySymbol.get(symbol));
        return [theme, { theme, tiles, ...calculateThemeStrength(tiles) }];
      })),
    };
  }

  async function loadDetail(input, timeframe = "4H") {
    const symbol = normalizeBaseSymbol(input);
    const interval = CHART_INTERVALS[timeframe] ?? CHART_INTERVALS["4H"];
    const chartCandles = await bybit.fetchCandles(symbol, { interval, limit: 120 });
    const modeEntries = await Promise.all(MODES.map(async (mode) => [
      mode,
      await bybit.fetchCandles(symbol, { interval: MODE_CONFIG[mode].interval, limit: 250 }),
    ]));
    const setups = buildSetups(Object.fromEntries(modeEntries));
    const setup = selectStrongestSetup(setups);
    const strength = strengthBySymbol.get(symbol) ?? calculateSymbolStrength({});
    return {
      symbol,
      timeframe: CHART_INTERVALS[timeframe] ? timeframe : "4H",
      chart: buildChartSeries(chartCandles),
      setups,
      setup,
      strength,
      briefing: buildMarketBriefing({ symbol, setup, strength }),
    };
  }

  return { loadDetail, refresh };
}
