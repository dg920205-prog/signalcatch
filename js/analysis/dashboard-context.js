const AUTOMATED_INPUTS = ["BTC", "ETH", "BTC/ETH", "Bybit 알트 시장 폭"];
const REFERENCE_INDICATORS = ["BTC.D", "USDT.D", "OTHERS.D", "OTHERS", "TOTAL3ES"];

function finiteOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp(value, minimum = -100, maximum = 100) {
  return Math.min(maximum, Math.max(minimum, finiteOrZero(value)));
}

function safeCandles(candles) {
  return Array.isArray(candles)
    ? candles.filter((candle) => typeof candle?.close === "number" && Number.isFinite(candle.close))
    : [];
}

function trendScore(candles) {
  const values = safeCandles(candles).map((candle) => candle.close);
  if (values.length < 2) return 0;
  const first = values[0];
  const last = values[values.length - 1];
  return first > 0 ? clamp(((last - first) / first) * 1000) : 0;
}

function relativeTrendScore(btcCandles, ethCandles) {
  return clamp(trendScore(btcCandles) - trendScore(ethCandles));
}

function breadthScore(altTiles = []) {
  const ready = Array.isArray(altTiles) ? altTiles.filter((tile) => tile?.status === "ready") : [];
  if (!ready.length) return 0;
  return clamp(ready.reduce((sum, tile) => sum + finiteOrZero(tile?.score), 0) / ready.length);
}

function directionFromScore(score) {
  if (score >= 25) return { direction: "bullish", label: "✅ 상승 우세" };
  if (score <= -25) return { direction: "bearish", label: "⛔ 하락 우세" };
  return { direction: "neutral", label: "⚠️ 혼조 · 중립 우세" };
}

function cardDirection(score) {
  if (score >= 15) return "▲ 상승";
  if (score <= -15) return "▼ 하락";
  return "● 중립";
}

function automatedCard(symbol, score, series = []) {
  return {
    symbol,
    source: "automated",
    score,
    direction: cardDirection(score),
    interpretation: `${symbol} 자동 분석 점수 ${score.toFixed(1)}`,
    series,
  };
}

function referenceCard(symbol) {
  return {
    symbol,
    source: "reference",
    score: 0,
    direction: "TradingView 참고",
    interpretation: "무료 위젯 시각 참고 지표",
    series: [],
  };
}

function closeSeries(candles) {
  return safeCandles(candles).map((candle) => candle.close);
}

export function buildDashboardContext({
  btcCandles = [],
  ethCandles = [],
  altTiles = [],
} = {}) {
  const btcScore = trendScore(btcCandles);
  const ethScore = trendScore(ethCandles);
  const relativeScore = relativeTrendScore(btcCandles, ethCandles);
  const altScore = breadthScore(altTiles);
  const hasMajorDisagreement = Math.abs(btcScore) >= 15 &&
    Math.abs(ethScore) >= 15 &&
    Math.sign(btcScore) !== Math.sign(ethScore);
  const score = hasMajorDisagreement
    ? clamp((btcScore * 0.2) + (ethScore * 0.2) + (relativeScore * 0.1) + (altScore * 0.3))
    : clamp((btcScore * 0.35) + (ethScore * 0.2) + (relativeScore * 0.2) + (altScore * 0.25));
  const { direction, label } = directionFromScore(score);

  return {
    score,
    direction,
    label,
    automatedInputs: [...AUTOMATED_INPUTS],
    referenceIndicators: [...REFERENCE_INDICATORS],
    cards: [
      automatedCard("BTC", btcScore, closeSeries(btcCandles)),
      automatedCard("ETH", ethScore, closeSeries(ethCandles)),
      automatedCard("BTC/ETH", relativeScore),
      ...REFERENCE_INDICATORS.map(referenceCard),
    ],
  };
}
