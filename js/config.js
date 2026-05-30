export const BACKTEST_DEFAULTS = {
  presetDays: 90,
  roundTripFeePct: 0.11,
  roundTripSlippagePct: 0.2,
};

export const MODE_CONFIG = {
  common: {
    label: "Common",
    interval: "60",
    waitCandles: 8,
  },
  scalp: {
    label: "Scalp",
    interval: "15",
    waitCandles: 6,
  },
  day: {
    label: "Day",
    interval: "240",
    waitCandles: 12,
  },
  daily: {
    label: "Daily",
    interval: "D",
    waitCandles: 6,
  },
  swing: {
    label: "Swing",
    interval: "W",
    waitCandles: 4,
  },
};

export const STORAGE_KEY = "signalcatch.settings.v1";
export const BYBIT_BASE_URL = "https://api.bybit.com";
export const BINANCE_BASE_URL = "https://api.binance.com";
