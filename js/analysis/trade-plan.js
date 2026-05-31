function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function buildTradePlan({ direction, close, atr } = {}) {
  if (
    !["bull", "bear"].includes(direction) ||
    !isPositiveNumber(close) ||
    !isPositiveNumber(atr)
  ) {
    return null;
  }

  if (direction === "bull") {
    return {
      direction,
      entryLow: close - atr * 0.5,
      entryHigh: close,
      tp: close + atr * 1.5,
      sl: close - atr * 1.5,
      rr: 1.5,
    };
  }

  return {
    direction,
    entryLow: close,
    entryHigh: close + atr * 0.5,
    tp: close - atr * 1.5,
    sl: close + atr * 1.5,
    rr: 1.5,
  };
}
