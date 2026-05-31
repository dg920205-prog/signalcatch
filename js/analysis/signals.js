import { atr, ema, rsi, sma, volumeRatio } from "./indicators.js";

const INSUFFICIENT_CANDLES = {
  direction: "neutral",
  score: 0,
  confidence: 0,
  reasons: ["분석에 필요한 캔들이 부족합니다."],
};

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidCandle(candle) {
  return (
    candle &&
    ["open", "high", "low", "close"].every(
      (field) => isFiniteNumber(candle[field]) && candle[field] > 0,
    ) &&
    isFiniteNumber(candle.volume) &&
    candle.volume >= 0 &&
    candle.high >= candle.low
  );
}

function neutralAnalysis(reason) {
  return {
    direction: "neutral",
    score: 0,
    confidence: 0,
    reasons: [reason],
  };
}

function modeResult(eligible, passReason, failReason) {
  return { eligible, reasons: [eligible ? passReason : failReason] };
}

export function analyzeCandles(candles) {
  if (!Array.isArray(candles) || candles.length < 30) {
    return {
      ...INSUFFICIENT_CANDLES,
      reasons: [...INSUFFICIENT_CANDLES.reasons],
    };
  }

  if (!candles.every(isValidCandle)) {
    return neutralAnalysis("유효한 캔들 데이터가 필요합니다.");
  }

  const closes = candles.map((candle) => candle?.close);
  const close = closes.at(-1);
  const fastEma = ema(closes, 9);
  const slowSma = sma(closes, 20);
  const currentRsi = rsi(closes, 14);
  const currentAtr = atr(candles, 14);
  const currentVolumeRatio = volumeRatio(candles, 20);

  if (
    [close, fastEma, slowSma, currentRsi, currentAtr, currentVolumeRatio].some(
      (value) => value === null || !Number.isFinite(value),
    )
  ) {
    return neutralAnalysis("유효한 캔들 데이터가 필요합니다.");
  }

  const reasons = [];
  let score = 0;

  if (fastEma > slowSma) {
    score += 45;
    reasons.push("단기 평균이 장기 평균보다 높습니다.");
  } else if (fastEma < slowSma) {
    score -= 45;
    reasons.push("단기 평균이 장기 평균보다 낮습니다.");
  } else {
    reasons.push("이동 평균 방향이 중립입니다.");
  }

  if (currentRsi >= 55) {
    score += 25;
    reasons.push("RSI가 상승 우위를 보입니다.");
  } else if (currentRsi <= 45) {
    score -= 25;
    reasons.push("RSI가 하락 우위를 보입니다.");
  } else {
    reasons.push("RSI가 중립 구간입니다.");
  }

  if (currentVolumeRatio >= 1.1) {
    score += Math.sign(score) * 10;
    reasons.push("최근 거래량이 이전 평균보다 높습니다.");
  } else {
    reasons.push("거래량 확인이 더 필요합니다.");
  }

  const direction = score >= 40 ? "bull" : score <= -40 ? "bear" : "neutral";

  const analysis = {
    direction,
    score,
    confidence: Math.min(Math.abs(score), 100),
    reasons,
    atr: currentAtr,
    close,
    volumeRatio: currentVolumeRatio,
    trendStrength: Math.abs(fastEma - slowSma) / close,
  };

  return [
    analysis.score,
    analysis.confidence,
    analysis.atr,
    analysis.close,
    analysis.volumeRatio,
    analysis.trendStrength,
  ].every(isFiniteNumber)
    ? analysis
    : neutralAnalysis("유효한 캔들 데이터가 필요합니다.");
}

export function classifyModes(analysis = {}) {
  const {
    direction = "neutral",
    confidence = 0,
    volumeRatio: currentVolumeRatio = 0,
    trendStrength = 0,
  } = analysis;
  const hasDirection = ["bull", "bear"].includes(direction);
  const commonEligible =
    hasDirection &&
    confidence >= 60 &&
    currentVolumeRatio >= 1 &&
    trendStrength >= 0.01;

  const common = modeResult(
    commonEligible,
    "공통 확정 조건을 충족했습니다.",
    "공통 확정 조건이 부족합니다.",
  );

  return {
    common,
    scalp: modeResult(
      commonEligible && confidence >= 65 && currentVolumeRatio >= 1.4,
      "스캘핑 조건을 충족했습니다.",
      "스캘핑 조건이 부족합니다.",
    ),
    day: modeResult(
      commonEligible && confidence >= 70 && currentVolumeRatio >= 1.2,
      "단타 조건을 충족했습니다.",
      "단타 조건이 부족합니다.",
    ),
    daily: modeResult(
      commonEligible && confidence >= 70 && trendStrength >= 0.02,
      "데일리 조건을 충족했습니다.",
      "데일리 조건이 부족합니다.",
    ),
    swing: modeResult(
      commonEligible && confidence >= 75 && trendStrength >= 0.03,
      "스윙 조건을 충족했습니다.",
      "스윙 조건이 부족합니다.",
    ),
  };
}
