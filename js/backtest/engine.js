import { analyzeCandles, classifyModes } from "../analysis/signals.js";
import { buildTradePlan } from "../analysis/trade-plan.js";

const SUPPORTED_MODES = new Set(["common", "scalp", "day", "daily", "swing"]);

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeNumber(value) {
  return isFiniteNumber(value) && value >= 0;
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
    !isNonNegativeNumber(costPct)
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

  return {
    status: "closed",
    outcome: exitPrice === plan.tp ? "win" : "loss",
    entryPrice,
    exitPrice,
    pnlPct: grossPnlPct - costPct,
    holdCandles,
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
}) {
  if (
    !Array.isArray(candles) ||
    !candles.every(isValidCandle) ||
    !SUPPORTED_MODES.has(mode) ||
    !isValidWaitCandles(waitCandles) ||
    !isNonNegativeNumber(feePct) ||
    !isNonNegativeNumber(slippagePct) ||
    !Number.isFinite(feePct + slippagePct) ||
    typeof analyze !== "function" ||
    typeof classify !== "function" ||
    typeof makePlan !== "function" ||
    typeof symbol !== "string"
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
  });

  const results = [];
  const costPct = feePct + slippagePct;

  for (let index = 0; index < candles.length; index += 1) {
    const analysis = analyze(candles.slice(0, index + 1));
    const modes = classify(analysis);

    if (!modes?.[mode]?.eligible) {
      continue;
    }

    if (index === candles.length - 1) {
      continue;
    }

    const plan = makePlan(analysis);

    if (plan === null) {
      continue;
    }

    results.push({
      symbol,
      mode,
      signalIndex: index,
      signalTime: candles[index].time,
      ...simulatePlannedTrade({
        plan,
        futureCandles: candles.slice(index + 1),
        waitCandles,
        costPct,
      }),
    });
  }

  return results;
}
