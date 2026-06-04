function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidPeriod(period) {
  return Number.isInteger(period) && period > 0;
}

function hasNumbers(values) {
  return Array.isArray(values) && values.every(isFiniteNumber);
}

function finiteOrNull(value) {
  return isFiniteNumber(value) ? value : null;
}

function isValidCandle(candle) {
  return (
    candle &&
    isFiniteNumber(candle.high) &&
    isFiniteNumber(candle.low) &&
    isFiniteNumber(candle.close) &&
    candle.high > 0 &&
    candle.low > 0 &&
    candle.close > 0 &&
    candle.low <= candle.close &&
    candle.close <= candle.high
  );
}

export function sma(values, period) {
  if (!hasNumbers(values) || !isValidPeriod(period) || values.length < period) {
    return null;
  }

  const window = values.slice(-period);
  return finiteOrNull(window.reduce((sum, value) => sum + value, 0) / period);
}

export function ema(values, period) {
  if (!hasNumbers(values) || !isValidPeriod(period) || values.length < period) {
    return null;
  }

  const multiplier = 2 / (period + 1);
  let result =
    values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

  if (!isFiniteNumber(result)) {
    return null;
  }

  for (let index = period; index < values.length; index += 1) {
    result = (values[index] - result) * multiplier + result;

    if (!isFiniteNumber(result)) {
      return null;
    }
  }

  return result;
}

export function rsi(values, period = 14) {
  if (
    !hasNumbers(values) ||
    !isValidPeriod(period) ||
    values.length < period + 1
  ) {
    return null;
  }

  let totalGain = 0;
  let totalLoss = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];

    if (!isFiniteNumber(change)) {
      return null;
    }

    totalGain += Math.max(change, 0);
    totalLoss += Math.max(-change, 0);
  }

  if (!isFiniteNumber(totalGain) || !isFiniteNumber(totalLoss)) {
    return null;
  }

  let averageGain = totalGain / period;
  let averageLoss = totalLoss / period;

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];

    if (!isFiniteNumber(change)) {
      return null;
    }

    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;

    if (!isFiniteNumber(averageGain) || !isFiniteNumber(averageLoss)) {
      return null;
    }
  }

  if (averageLoss === 0) {
    return averageGain === 0 ? 50 : 100;
  }

  return finiteOrNull(100 - 100 / (1 + averageGain / averageLoss));
}

export function atr(candles, period = 14) {
  if (
    !Array.isArray(candles) ||
    !isValidPeriod(period) ||
    candles.length < period ||
    !candles.every(isValidCandle)
  ) {
    return null;
  }

  const trueRanges = candles.map((candle, index) => {
    if (index === 0) {
      return candle.high - candle.low;
    }

    const previousClose = candles[index - 1].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
  });

  if (!trueRanges.every(isFiniteNumber)) {
    return null;
  }

  let result =
    trueRanges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;

  if (!isFiniteNumber(result)) {
    return null;
  }

  for (let index = period; index < trueRanges.length; index += 1) {
    result = (result * (period - 1) + trueRanges[index]) / period;

    if (!isFiniteNumber(result)) {
      return null;
    }
  }

  return result;
}

export function volumeRatio(candles, period = 20) {
  if (
    !Array.isArray(candles) ||
    !isValidPeriod(period) ||
    candles.length < period + 1
  ) {
    return null;
  }

  const volumes = candles.map((candle) => candle?.volume);

  if (!volumes.every((volume) => isFiniteNumber(volume) && volume >= 0)) {
    return null;
  }

  const previousVolumes = volumes.slice(-period - 1, -1);
  const average =
    previousVolumes.reduce((sum, volume) => sum + volume, 0) / period;

  return average > 0 && isFiniteNumber(average)
    ? finiteOrNull(volumes.at(-1) / average)
    : null;
}

export function adx(candles, period = 14) {
  if (
    !Array.isArray(candles) ||
    !isValidPeriod(period) ||
    candles.length < 2 * period + 1 ||
    !candles.every(isValidCandle)
  ) {
    return null;
  }

  const trList = [];
  const plusDmList = [];
  const minusDmList = [];

  for (let i = 1; i < candles.length; i += 1) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevHigh = candles[i - 1].high;
    const prevLow = candles[i - 1].low;
    const prevClose = candles[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;

    if (![tr, plusDm, minusDm].every(isFiniteNumber)) {
      return null;
    }

    trList.push(tr);
    plusDmList.push(plusDm);
    minusDmList.push(minusDm);
  }

  let smoothedTr = trList.slice(0, period).reduce((s, v) => s + v, 0);
  let smoothedPlusDm = plusDmList.slice(0, period).reduce((s, v) => s + v, 0);
  let smoothedMinusDm = minusDmList.slice(0, period).reduce((s, v) => s + v, 0);

  const dxValues = [];

  for (let i = period - 1; i < trList.length; i += 1) {
    if (i >= period) {
      smoothedTr = smoothedTr - smoothedTr / period + trList[i];
      smoothedPlusDm = smoothedPlusDm - smoothedPlusDm / period + plusDmList[i];
      smoothedMinusDm = smoothedMinusDm - smoothedMinusDm / period + minusDmList[i];
    }

    if (smoothedTr <= 0) {
      dxValues.push(0);
      continue;
    }

    const plusDi = (100 * smoothedPlusDm) / smoothedTr;
    const minusDi = (100 * smoothedMinusDm) / smoothedTr;
    const sumDi = plusDi + minusDi;
    const dx = sumDi === 0 ? 0 : (100 * Math.abs(plusDi - minusDi)) / sumDi;

    if (!isFiniteNumber(dx)) {
      return null;
    }

    dxValues.push(dx);
  }

  if (dxValues.length < period) {
    return null;
  }

  let result = dxValues.slice(0, period).reduce((s, v) => s + v, 0) / period;

  if (!isFiniteNumber(result)) {
    return null;
  }

  for (let i = period; i < dxValues.length; i += 1) {
    result = (result * (period - 1) + dxValues[i]) / period;
    if (!isFiniteNumber(result)) {
      return null;
    }
  }

  return result;
}
