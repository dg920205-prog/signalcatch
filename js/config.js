export const BACKTEST_DEFAULTS = {
  presetDays: 90,
  roundTripFeePct: 0.11,
  roundTripSlippagePct: 0.2,
};

export const MODE_CONFIG = {
  common: {
    label: "공통 확정",
    interval: "60",
    waitCandles: 8,
  },
  scalp: {
    label: "스캘핑",
    interval: "15",
    waitCandles: 6,
  },
  day: {
    label: "단타",
    interval: "60",
    waitCandles: 12,
  },
  daily: {
    label: "데일리",
    interval: "240",
    waitCandles: 6,
  },
  swing: {
    label: "스윙",
    interval: "D",
    waitCandles: 4,
  },
};

export const STORAGE_KEY = "signalcatch.settings.v1";
export const BYBIT_BASE_URL = "https://api.bybit.com";
export const BINANCE_BASE_URL = "https://fapi.binance.com";
