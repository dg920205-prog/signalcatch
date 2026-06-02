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

function roundPrice(value) {
  return Number.isFinite(value) ? Number(value.toFixed(8)) : null;
}

export function buildSplitTargets(plan, mode, weights = [0.4, 0.35, 0.25]) {
  if (!isValidPlan(plan)) {
    return null;
  }

  if (!["daily", "swing"].includes(mode)) {
    return null;
  }

  const safeWeights =
    Array.isArray(weights) &&
    weights.length === 3 &&
    weights.every((value) => typeof value === "number" && value > 0)
      ? weights
      : [0.4, 0.35, 0.25];

  const risk =
    plan.direction === "bull"
      ? plan.entryHigh - plan.sl
      : plan.sl - plan.entryLow;

  if (!(risk > 0)) {
    return null;
  }

  const levels = [0.8, 1.2, 1.8];
  const targets = levels.map((multiplier, index) => {
    const price =
      plan.direction === "bull"
        ? plan.entryHigh + risk * multiplier
        : plan.entryLow - risk * multiplier;
    return {
      label: `TP${index + 1}`,
      price: roundPrice(price),
      weightPct: Number((safeWeights[index] * 100).toFixed(2)),
    };
  });

  const entries = [0, 0.25, 0.5].map((multiplier, index) => {
    const price =
      plan.direction === "bull"
        ? plan.entryHigh - risk * multiplier
        : plan.entryLow + risk * multiplier;
    return {
      label: `E${index + 1}`,
      price: roundPrice(price),
      weightPct: Number(([0.25, 0.35, 0.4][index] * 100).toFixed(2)),
    };
  });

  return { entries, targets };
}
