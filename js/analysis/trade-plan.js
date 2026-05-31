function isPositiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isValidPlan(plan) {
  const { direction, entryLow, entryHigh, tp, sl, rr } = plan;

  if (![entryLow, entryHigh, tp, sl, rr].every(isPositiveNumber)) {
    return false;
  }

  return direction === "bull"
    ? sl < entryLow && entryLow < entryHigh && entryHigh < tp
    : tp < entryLow && entryLow < entryHigh && entryHigh < sl;
}

export function buildTradePlan({ direction, close, atr } = {}) {
  if (
    !["bull", "bear"].includes(direction) ||
    !isPositiveNumber(close) ||
    !isPositiveNumber(atr)
  ) {
    return null;
  }

  const plan =
    direction === "bull"
      ? {
          direction,
          entryLow: close - atr * 0.5,
          entryHigh: close,
          tp: close + atr * 1.5,
          sl: close - atr,
          rr: 1.5,
        }
      : {
          direction,
          entryLow: close,
          entryHigh: close + atr * 0.5,
          tp: close - atr * 1.5,
          sl: close + atr,
          rr: 1.5,
        };

  return isValidPlan(plan) ? plan : null;
}
