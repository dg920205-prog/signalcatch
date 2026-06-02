import { analyzeCandles, classifyModes } from "../analysis/signals.js";
import { buildSplitTargets, buildTradePlan } from "../analysis/trade-plan.js";

const SUPPORTED_MODES = new Set(["common", "scalp", "day", "daily", "swing"]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeNumber(value) {
  return isFiniteNumber(value) && value >= 0;
}

function isValidCostPct(value) {
  return isNonNegativeNumber(value) && value <= 10;
}

function isPositiveNumber(value) {
  return isFiniteNumber(value) && value > 0;
}

function isValidWaitCandles(value) {
  return Number.isInteger(value) && value >= 0;
}

function isValidCandle(candle) {
  return (
    candle &&
    typeof candle === "object" &&
    ["open", "high", "low", "close"].every((field) =>
      isPositiveNumber(candle[field]),
    ) &&
    candle.low <= candle.open &&
    candle.open <= candle.high &&
    candle.low <= candle.close &&
    candle.close <= candle.high
  );
}

function isValidPlan(plan) {
  if (!plan || typeof plan !== "object") {
    return false;
  }

  const { direction, entryLow, entryHigh, tp, sl, rr } = plan;

  if (![entryLow, entryHigh, tp, sl, rr].every(isPositiveNumber)) {
    return false;
  }

  return direction === "bull"
    ? sl < entryLow && entryLow < entryHigh && entryHigh < tp
    : direction === "bear" &&
        tp < entryLow &&
        entryLow < entryHigh &&
        entryHigh < sl;
}

function validateSimulationInput({ plan, futureCandles, waitCandles, costPct }) {
  if (
    !isValidPlan(plan) ||
    !Array.isArray(futureCandles) ||
    !futureCandles.every(isValidCandle) ||
    !isValidWaitCandles(waitCandles) ||
    !isValidCostPct(costPct)
  ) {
    throw new TypeError("Invalid planned trade simulation input");
  }
}

function touchesEntryZone(candle, plan) {
  return candle.low <= plan.entryHigh && candle.high >= plan.entryLow;
}

function closeTrade(plan, entryPrice, exitPrice, holdCandles, costPct) {
  const grossPnlPct =
    plan.direction === "bull"
      ? ((exitPrice - entryPrice) / entryPrice) * 100
      : ((entryPrice - exitPrice) / entryPrice) * 100;
  const pnlPct = grossPnlPct - costPct;

  if (!Number.isFinite(pnlPct)) {
    throw new TypeError("Invalid planned trade pnl");
  }

  return {
    status: "closed",
    outcome: exitPrice === plan.tp ? "win" : "loss",
    entryPrice,
    exitPrice,
    pnlPct,
    holdCandles,
  };
}

function touchesPrice(candle, price) {
  return candle.low <= price && candle.high >= price;
}

function hitsTarget(direction, candle, price) {
  return direction === "bull" ? candle.high >= price : candle.low <= price;
}

function weightedAverage(legs) {
  const totalWeight = legs.reduce((total, leg) => total + leg.weightPct, 0);
  return legs.reduce((total, leg) => total + leg.price * leg.weightPct, 0) / totalWeight;
}

function validSplitLegs(legs) {
  return (
    Array.isArray(legs) &&
    legs.length === 3 &&
    legs.every(
      ({ price, weightPct }) =>
        isPositiveNumber(price) && isPositiveNumber(weightPct),
    ) &&
    Math.abs(legs.reduce((total, { weightPct }) => total + weightPct, 0) - 100) <
      0.000001
  );
}

function directionPnlPct(direction, entryPrice, exitPrice) {
  return direction === "bull"
    ? ((exitPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - exitPrice) / entryPrice) * 100;
}

export function simulateSplitPlannedTrade({
  plan,
  split,
  futureCandles,
  waitCandles,
  costPct,
} = {}) {
  validateSimulationInput({ plan, futureCandles, waitCandles, costPct });

  if (
    !split ||
    !validSplitLegs(split.entries) ||
    !validSplitLegs(split.targets)
  ) {
    throw new TypeError("Invalid split planned trade simulation input");
  }

  const entries = split.entries.map((entry) => ({ ...entry, filled: false }));
  const targets = split.targets.map((target) => ({ ...target, filled: false }));

  for (let index = 0; index < Math.min(waitCandles, futureCandles.length); index += 1) {
    const candle = futureCandles[index];
    for (const entry of entries) {
      if (!entry.filled && touchesPrice(candle, entry.price)) {
        entry.filled = true;
      }
    }
    const filledEntries = entries.filter(({ filled }) => filled);
    const hitsStop =
      plan.direction === "bull" ? candle.low <= plan.sl : candle.high >= plan.sl;
    if (filledEntries.length > 0 && hitsStop) {
      const entryPrice = weightedAverage(filledEntries);
      return {
        status: "closed",
        outcome: "loss",
        entryPrice,
        exitPrice: plan.sl,
        pnlPct: directionPnlPct(plan.direction, entryPrice, plan.sl) - costPct,
        holdCandles: index,
        filledEntryLegs: filledEntries.length,
        filledTargetLegs: 0,
      };
    }
  }

  const filledEntries = entries.filter(({ filled }) => filled);
  if (filledEntries.length === 0) {
    return { status: "unfilled" };
  }

  const entryPrice = weightedAverage(filledEntries);
  let realizedPnlPct = 0;
  let remainingWeight = 100;

  for (let index = waitCandles; index < futureCandles.length; index += 1) {
    const candle = futureCandles[index];
    const hitsStop =
      plan.direction === "bull" ? candle.low <= plan.sl : candle.high >= plan.sl;
    if (hitsStop) {
      realizedPnlPct +=
        directionPnlPct(plan.direction, entryPrice, plan.sl) * (remainingWeight / 100);
      const pnlPct = realizedPnlPct - costPct;
      return {
        status: "closed",
        outcome: pnlPct >= 0 ? "win" : "loss",
        entryPrice,
        exitPrice: plan.sl,
        pnlPct,
        holdCandles: index,
        filledEntryLegs: filledEntries.length,
        filledTargetLegs: targets.filter(({ filled }) => filled).length,
      };
    }

    for (const target of targets) {
      if (!target.filled && hitsTarget(plan.direction, candle, target.price)) {
        target.filled = true;
        remainingWeight -= target.weightPct;
        realizedPnlPct +=
          directionPnlPct(plan.direction, entryPrice, target.price) *
          (target.weightPct / 100);
      }
    }
    if (remainingWeight <= 0.000001) {
      return {
        status: "closed",
        outcome: "win",
        entryPrice,
        exitPrice: targets.at(-1).price,
        pnlPct: realizedPnlPct - costPct,
        holdCandles: index,
        filledEntryLegs: filledEntries.length,
        filledTargetLegs: targets.length,
      };
    }
  }

  return {
    status: "open",
    entryPrice,
    holdCandles: Math.max(0, futureCandles.length - waitCandles),
    filledEntryLegs: filledEntries.length,
    filledTargetLegs: targets.filter(({ filled }) => filled).length,
  };
}

export function simulatePlannedTrade({
  plan,
  futureCandles,
  waitCandles,
  costPct,
} = {}) {
  validateSimulationInput({ plan, futureCandles, waitCandles, costPct });

  const entryIndex = futureCandles
    .slice(0, waitCandles)
    .findIndex((candle) => touchesEntryZone(candle, plan));

  if (entryIndex === -1) {
    return { status: "unfilled" };
  }

  const entryPrice = plan.direction === "bull" ? plan.entryHigh : plan.entryLow;

  for (let index = entryIndex; index < futureCandles.length; index += 1) {
    const candle = futureCandles[index];
    const hitsStop =
      plan.direction === "bull" ? candle.low <= plan.sl : candle.high >= plan.sl;
    const hitsTarget =
      plan.direction === "bull" ? candle.high >= plan.tp : candle.low <= plan.tp;

    if (hitsStop) {
      return closeTrade(plan, entryPrice, plan.sl, index - entryIndex, costPct);
    }
    if (hitsTarget) {
      return closeTrade(plan, entryPrice, plan.tp, index - entryIndex, costPct);
    }
  }

  return {
    status: "open",
    entryPrice,
    holdCandles: futureCandles.length - entryIndex - 1,
  };
}

function validateBacktestInput({
  candles,
  mode,
  waitCandles,
  feePct,
  slippagePct,
  analyze,
  classify,
  makePlan,
  symbol,
  allowOverlapping,
}) {
  if (
    !Array.isArray(candles) ||
    !candles.every(isValidCandle) ||
    !SUPPORTED_MODES.has(mode) ||
    !isValidWaitCandles(waitCandles) ||
    !isValidCostPct(feePct) ||
    !isValidCostPct(slippagePct) ||
    !isValidCostPct(feePct + slippagePct) ||
    typeof analyze !== "function" ||
    typeof classify !== "function" ||
    typeof makePlan !== "function" ||
    typeof symbol !== "string" ||
    typeof allowOverlapping !== "boolean"
  ) {
    throw new TypeError("Invalid backtest input");
  }
}

export function runBacktest({
  candles,
  mode,
  waitCandles,
  feePct,
  slippagePct,
  analyze = analyzeCandles,
  classify = classifyModes,
  makePlan = buildTradePlan,
  symbol = "",
  allowOverlapping = false,
} = {}) {
  validateBacktestInput({
    candles,
    mode,
    waitCandles,
    feePct,
    slippagePct,
    analyze,
    classify,
    makePlan,
    symbol,
    allowOverlapping,
  });

  const results = [];
  const costPct = feePct + slippagePct;
  let blockedThroughIndex = -1;

  for (let index = 0; index < candles.length; index += 1) {
    const analysis = analyze(candles.slice(0, index + 1));
    const modes = classify(analysis);

    if (!modes?.[mode]?.eligible || (!allowOverlapping && index <= blockedThroughIndex)) {
      continue;
    }

    if (index === candles.length - 1) {
      continue;
    }

    const plan = makePlan(analysis);

    if (plan === null) {
      continue;
    }

    const split = buildSplitTargets(plan, mode);
    const simulated = split
      ? simulateSplitPlannedTrade({
          plan,
          split,
          futureCandles: candles.slice(index + 1),
          waitCandles,
          costPct,
        })
      : simulatePlannedTrade({
          plan,
          futureCandles: candles.slice(index + 1),
          waitCandles,
          costPct,
        });

    results.push({
      symbol,
      mode,
      signalIndex: index,
      signalTime: candles[index].time,
      ...simulated,
    });

    if (!allowOverlapping) {
      blockedThroughIndex =
        simulated.status === "open"
          ? Number.POSITIVE_INFINITY
          : index + (simulated.status === "unfilled" ? waitCandles : simulated.holdCandles + 1);
    }
  }

  return results;
}
