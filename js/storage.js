import { STORAGE_KEY } from "./config.js";
import { normalizeBaseSymbol } from "./core/symbols.js";

const ACTIVE_TABS = new Set(["manual", "scanner", "backtest", "auxiliary"]);
const MODES = new Set(["common", "scalp", "day", "daily", "swing"]);
const EXCHANGES = new Set(["bybit", "binance"]);

function createSafeDefaults() {
  return {
    persist: false,
    manualAssets: [],
    ui: {},
    backtestDefaults: {
      waitCandles: {},
    },
  };
}

function isNumberInRange(value, minimum, maximum) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function sanitizeManualAssets(manualAssets) {
  if (!Array.isArray(manualAssets)) {
    return [];
  }

  const sanitized = [];
  const seen = new Set();

  for (const asset of manualAssets) {
    if (
      sanitized.length >= 100 ||
      !asset ||
      typeof asset !== "object" ||
      !EXCHANGES.has(asset.exchange)
    ) {
      continue;
    }

    try {
      const symbol = normalizeBaseSymbol(asset.symbol);
      const key = `${asset.exchange}:${symbol}`;

      if (!seen.has(key)) {
        seen.add(key);
        sanitized.push({ symbol, exchange: asset.exchange });
      }
    } catch {
      // Ignore invalid user-entered symbols while restoring preferences.
    }
  }

  return sanitized;
}

function sanitizeUi(ui) {
  const sanitized = {};

  if (!ui || typeof ui !== "object") {
    return sanitized;
  }

  if (ACTIVE_TABS.has(ui.activeTab)) {
    sanitized.activeTab = ui.activeTab;
  }
  if (MODES.has(ui.selectedMode)) {
    sanitized.selectedMode = ui.selectedMode;
  }
  if (ui.theme === "navy") {
    sanitized.theme = ui.theme;
  }

  return sanitized;
}

function sanitizeBacktestDefaults(backtestDefaults) {
  const sanitized = { waitCandles: {} };

  if (!backtestDefaults || typeof backtestDefaults !== "object") {
    return sanitized;
  }

  if (
    Number.isSafeInteger(backtestDefaults.presetDays) &&
    isNumberInRange(backtestDefaults.presetDays, 1, 365)
  ) {
    sanitized.presetDays = backtestDefaults.presetDays;
  }
  if (isNumberInRange(backtestDefaults.roundTripFeePct, 0, 10)) {
    sanitized.roundTripFeePct = backtestDefaults.roundTripFeePct;
  }
  if (isNumberInRange(backtestDefaults.roundTripSlippagePct, 0, 10)) {
    sanitized.roundTripSlippagePct = backtestDefaults.roundTripSlippagePct;
  }

  const waitCandles = backtestDefaults.waitCandles;
  if (!waitCandles || typeof waitCandles !== "object") {
    return sanitized;
  }

  for (const mode of MODES) {
    const value = waitCandles[mode];
    if (Number.isSafeInteger(value) && isNumberInRange(value, 1, 500)) {
      sanitized.waitCandles[mode] = value;
    }
  }

  return sanitized;
}

function sanitizeSettings(settings) {
  if (!settings || typeof settings !== "object" || settings.persist !== true) {
    return createSafeDefaults();
  }

  return {
    persist: true,
    manualAssets: sanitizeManualAssets(settings.manualAssets),
    ui: sanitizeUi(settings.ui),
    backtestDefaults: sanitizeBacktestDefaults(settings.backtestDefaults),
  };
}

export function createStorage(backend) {
  return {
    load() {
      try {
        const stored = backend.getItem(STORAGE_KEY);
        return stored === null ? createSafeDefaults() : sanitizeSettings(JSON.parse(stored));
      } catch {
        return createSafeDefaults();
      }
    },

    save(settings) {
      try {
        if (!settings || settings.persist !== true) {
          backend.removeItem(STORAGE_KEY);
          return;
        }

        backend.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
      } catch {
        // Persistence failures must not interrupt the dashboard.
      }
    },

    clear() {
      try {
        backend.removeItem(STORAGE_KEY);
      } catch {
        // Persistence failures must not interrupt the dashboard.
      }
    },
  };
}
