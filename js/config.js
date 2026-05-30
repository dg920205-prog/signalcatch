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
  }),
  scalp: Object.freeze({
    label: "스캘핑",
    interval: "15",
    waitCandles: 6,
  }),
  day: Object.freeze({
    label: "단타",
    interval: "60",
    waitCandles: 12,
  }),
  daily: Object.freeze({
    label: "데일리",
    interval: "240",
    waitCandles: 6,
  }),
  swing: Object.freeze({
    label: "스윙",
    interval: "D",
    waitCandles: 4,
  }),
});

export const STORAGE_KEY = "signalcatch.settings.v1";
export const BYBIT_BASE_URL = "https://api.bybit.com";
export const BINANCE_BASE_URL = "https://fapi.binance.com";
