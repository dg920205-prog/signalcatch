function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function buildModeJobs(modes, modeConfig) {
  return modes.map((mode) => ({
    mode,
    interval: modeConfig[mode].interval,
    waitCandles: modeConfig[mode].waitCandles,
  }));
}

export function selectBybitSymbols(assets = []) {
  return [
    ...new Set(
      assets
        .filter((asset) => asset?.exchange === "Bybit")
        .map((asset) => asset.symbol),
    ),
  ];
}

export function partitionOosTrades(trades, candleCount) {
  const splitIndex = Math.floor(candleCount * 0.8);
  const inSample = [];
  const outOfSample = [];

  for (const trade of trades) {
    const oosBucket =
      trade.signalIndex >= splitIndex ? "out-of-sample" : "in-sample";
    const bucketedTrade = { ...trade, oosBucket };
    (oosBucket === "out-of-sample" ? outOfSample : inSample).push(bucketedTrade);
  }

  return { splitIndex, inSample, outOfSample };
}

export function presetDateWindow(days, now = new Date()) {
  if (!Number.isSafeInteger(days) || days < 1 || days > 365) {
    throw new TypeError("Invalid preset days.");
  }
  const end = new Date(now);
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}
