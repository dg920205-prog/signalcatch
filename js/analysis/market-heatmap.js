export const THEMES = Object.freeze({
  Major: ["BTC", "ETH", "SOL", "XRP"],
  L1: ["SOL", "ADA", "AVAX", "SUI", "TON", "NEAR", "APT"],
  L2: ["ARB", "OP", "STRK", "ZK", "MNT"],
  DeFi: ["UNI", "AAVE", "LINK", "CRV", "ONDO"],
  AI: ["FET", "RENDER", "TAO", "WLD"],
  Meme: ["DOGE", "SHIB", "PEPE", "BONK", "WIF"],
  Gaming: ["IMX", "GALA", "SAND", "AXS"],
  RWA: ["ONDO", "LINK", "MKR", "POLYX"],
});

function finiteOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp(value, minimum = -100, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, finiteOrZero(value)));
}

function strengthLabel(score) {
  return score >= 25 ? "Strong" : score <= -25 ? "Weak" : "Neutral";
}

export function calculateVolumeChange(current, previous) {
  if (
    typeof current !== "number" ||
    !Number.isFinite(current) ||
    typeof previous !== "number" ||
    !Number.isFinite(previous)
  ) {
    return 0;
  }
  const safeCurrent = finiteOrZero(current);
  const safePrevious = finiteOrZero(previous);
  return safePrevious > 0 ? clamp(((safeCurrent - safePrevious) / safePrevious) * 100) : 0;
}

export function calculateSymbolStrength({
  change24hPct,
  volumeChange24hPct,
  volumeAcceleration4hPct,
} = {}) {
  const score = clamp(
    clamp(change24hPct * 10) * 0.6 +
    clamp(volumeChange24hPct) * 0.3 +
    clamp(volumeAcceleration4hPct) * 0.1,
  );
  return { score, label: strengthLabel(score) };
}

export function calculateThemeStrength(symbols = []) {
  let weightedScore = 0;
  let totalTurnover = 0;
  for (const symbol of Array.isArray(symbols) ? symbols : []) {
    const turnover = Math.max(0, finiteOrZero(symbol?.turnover24h));
    weightedScore += finiteOrZero(symbol?.score) * turnover;
    totalTurnover += turnover;
  }
  const score = totalTurnover > 0 ? clamp(weightedScore / totalTurnover) : 0;
  return { score, label: strengthLabel(score) };
}

export function selectStrongestSetup(setups = {}) {
  const weights = { "비추천": 0, "주의": 1, "추천": 2 };
  return Object.values(setups).reduce((best, setup) => {
    if (!setup || typeof setup !== "object") return best;
    const weight = weights[setup.recommendation?.label] ?? 0;
    const bestWeight = weights[best?.recommendation?.label] ?? -1;
    return weight > bestWeight ? setup : best;
  }, null);
}

export function buildMarketBriefing({ symbol = "Unknown", setup = {}, strength = {} } = {}) {
  const direction = setup?.direction ?? "neutral";
  const recommendation = setup?.recommendation?.label ?? "비추천";
  const label = strength?.label ?? "Neutral";
  const score = finiteOrZero(strength?.score).toFixed(1);
  return `${symbol} 시장 강도는 ${label} (${score})입니다. 현재 방향은 ${direction}, 셋업 평가는 ${recommendation}입니다. 이 코멘트는 관측 데이터 기반 분석이며 투자 조언이나 수익 보장이 아닙니다.`;
}

function movingAverage(values, period) {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const slice = values.slice(index + 1 - period, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / period;
  });
}

export function buildChartSeries(candles = []) {
  const safeCandles = Array.isArray(candles)
    ? candles.filter((candle) =>
        typeof candle?.time === "number" &&
        typeof candle?.close === "number" &&
        Number.isFinite(candle.close),
      )
    : [];
  const prices = safeCandles.map((candle) => ({ time: candle.time, value: candle.close }));
  const values = prices.map(({ value }) => value);
  return {
    prices,
    shortAverage: movingAverage(values, 7),
    longAverage: movingAverage(values, 21),
  };
}
