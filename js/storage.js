import { STORAGE_KEY } from "./config.js";
import { normalizeBaseSymbol } from "./core/symbols.js";

const ACTIVE_TABS = new Set(["manual", "scanner", "market"]);
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

function readCandidate(object, property) {
  try {
    return { ok: true, value: object[property] };
  } catch {
    return { ok: false };
  }
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
      typeof asset !== "object"
    ) {
      continue;
    }

    try {
      const symbolCandidate = readCandidate(asset, "symbol");
      const exchangeCandidate = readCandidate(asset, "exchange");

      if (!symbolCandidate.ok || !exchangeCandidate.ok || !EXCHANGES.has(exchangeCandidate.value)) {
        continue;
      }

      const symbol = normalizeBaseSymbol(symbolCandidate.value);
      const exchange = exchangeCandidate.value;
      const key = `${exchange}:${symbol}`;

      if (!seen.has(key)) {
        seen.add(key);
        sanitized.push({ symbol, exchange });
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

  const activeTab = readCandidate(ui, "activeTab");
  const selectedMode = readCandidate(ui, "selectedMode");
  const theme = readCandidate(ui, "theme");

  if (activeTab.ok && ACTIVE_TABS.has(activeTab.value)) {
    sanitized.activeTab = activeTab.value;
  }
  if (selectedMode.ok && MODES.has(selectedMode.value)) {
    sanitized.selectedMode = selectedMode.value;
  }
  if (theme.ok && theme.value === "navy") {
    sanitized.theme = theme.value;
  }

  return sanitized;
}

function sanitizeBacktestDefaults(backtestDefaults) {
  const sanitized = { waitCandles: {} };

  if (!backtestDefaults || typeof backtestDefaults !== "object") {
    return sanitized;
  }

  const presetDays = readCandidate(backtestDefaults, "presetDays");
  const roundTripFeePct = readCandidate(backtestDefaults, "roundTripFeePct");
  const roundTripSlippagePct = readCandidate(backtestDefaults, "roundTripSlippagePct");
  const waitCandles = readCandidate(backtestDefaults, "waitCandles");

  if (
    presetDays.ok &&
    Number.isSafeInteger(presetDays.value) &&
    isNumberInRange(presetDays.value, 1, 365)
  ) {
    sanitized.presetDays = presetDays.value;
  }
  if (roundTripFeePct.ok && isNumberInRange(roundTripFeePct.value, 0, 10)) {
    sanitized.roundTripFeePct = roundTripFeePct.value;
  }
  if (roundTripSlippagePct.ok && isNumberInRange(roundTripSlippagePct.value, 0, 10)) {
    sanitized.roundTripSlippagePct = roundTripSlippagePct.value;
  }

  if (!waitCandles.ok || !waitCandles.value || typeof waitCandles.value !== "object") {
    return sanitized;
  }

  for (const mode of MODES) {
    const candidate = readCandidate(waitCandles.value, mode);
    if (
      candidate.ok &&
      Number.isSafeInteger(candidate.value) &&
      isNumberInRange(candidate.value, 1, 500)
    ) {
      sanitized.waitCandles[mode] = candidate.value;
    }
  }

  return sanitized;
}

function sanitizeSettings(settings, persistCandidate = readCandidate(settings, "persist")) {
  if (
    !settings ||
    typeof settings !== "object" ||
    !persistCandidate.ok ||
    persistCandidate.value !== true
  ) {
    return createSafeDefaults();
  }

  const manualAssets = readCandidate(settings, "manualAssets");
  const ui = readCandidate(settings, "ui");
  const backtestDefaults = readCandidate(settings, "backtestDefaults");

  return {
    persist: true,
    manualAssets: sanitizeManualAssets(manualAssets.ok ? manualAssets.value : undefined),
    ui: sanitizeUi(ui.ok ? ui.value : undefined),
    backtestDefaults: sanitizeBacktestDefaults(
      backtestDefaults.ok ? backtestDefaults.value : undefined,
    ),
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
        const persistCandidate = readCandidate(settings, "persist");
        if (!settings || !persistCandidate.ok || persistCandidate.value !== true) {
          backend.removeItem(STORAGE_KEY);
          return;
        }

        backend.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings, persistCandidate)));
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
