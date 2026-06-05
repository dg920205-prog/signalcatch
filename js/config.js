export const BACKTEST_DEFAULTS = Object.freeze({
  presetDays: 90,
  roundTripFeePct: 0.11,
  roundTripSlippagePct: 0.2,
});

export const MODE_CONFIG = Object.freeze({
  common: Object.freeze({
    label: "공통 확정",
    interval: "60",
    waitCandles: 8,
    htfInterval: "240",
    htfLongEmaPeriod: 200,
    htfShortEmaPeriod: 50,
  }),
  scalp: Object.freeze({
    label: "스캘핑",
    interval: "15",
    waitCandles: 6,
    htfInterval: "60",
    htfLongEmaPeriod: 200,
    htfShortEmaPeriod: 50,
  }),
  day: Object.freeze({
    label: "단타",
    interval: "60",
    waitCandles: 12,
    htfInterval: "240",
    htfLongEmaPeriod: 200,
    htfShortEmaPeriod: 50,
  }),
  daily: Object.freeze({
    label: "데일리",
    interval: "240",
    waitCandles: 6,
    htfInterval: "D",
    htfLongEmaPeriod: 200,
    htfShortEmaPeriod: 50,
  }),
  swing: Object.freeze({
    label: "스윙",
    interval: "D",
    waitCandles: 4,
    htfInterval: "D",
    htfLongEmaPeriod: 500,
    htfShortEmaPeriod: 100,
  }),
});

export const STORAGE_KEY = "signalcatch.settings.v1";
export const BYBIT_BASE_URL = "https://api.bybit.com";
export const BINANCE_BASE_URL = "https://fapi.binance.com";

export const TREND_GATING = Object.freeze({
  adxPeriod: 14,
  adxStrongThreshold: 25,
  adxRangingThreshold: 20,
  neutralBandPct: 0.01,
  btcOverlayPenalty: 0.80,
  btcSymbol: "BTC",
  btcHtfInterval: "D",
  btcHtfLongEmaPeriod: 200,
  btcHtfShortEmaPeriod: 50,
  multipliers: Object.freeze({
    long: Object.freeze({
      strong_bull: 1.20,
      weak_bull: 1.05,
      neutral: 0.90,
      weak_bear: 0.60,
      strong_bear: 0.30,
      insufficient_data: 1.00,
    }),
    short: Object.freeze({
      strong_bull: 0.30,
      weak_bull: 0.60,
      neutral: 0.90,
      weak_bear: 1.05,
      strong_bear: 1.20,
      insufficient_data: 1.00,
    }),
  }),
});

export const STRUCTURE_GATING = Object.freeze({
  swingLookback: 2,
  multipliers: Object.freeze({
    long: Object.freeze({
      bullish_structure: 1.05,
      bearish_structure: 0.95,
      mixed: 1.00,
      unknown: 1.00,
    }),
    short: Object.freeze({
      bullish_structure: 0.95,
      bearish_structure: 1.05,
      mixed: 1.00,
      unknown: 1.00,
    }),
  }),
});
