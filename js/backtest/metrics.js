function isNumberInRange(value, min, max) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isValidPnlPct(value) {
  return isNumberInRange(value, -100, 10000);
}

function isValidRR(value) {
  return isNumberInRange(value, 0, 100);
}

function isValidHoldCandles(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function roundMetric(value) {
  return Number.isFinite(value) ? Number(value.toFixed(12)) : 0;
}

function addFinite(total, value) {
  const next = total + value;

  return Number.isFinite(next) ? next : Number.MAX_VALUE;
}

function multiplyFinite(value, factor) {
  const next = value * factor;

  return Number.isFinite(next) ? next : Number.MAX_VALUE;
}

export function buildEquitySeries(trades = []) {
  const series = [100];
  let equity = 100;

  for (const trade of trades) {
    try {
      if (trade?.status !== "closed" || !isValidPnlPct(trade.pnlPct)) {
        continue;
      }
      equity = multiplyFinite(equity, 1 + trade.pnlPct / 100);
      series.push(roundMetric(equity));
    } catch {
      // Skip malformed external rows without interrupting chart rendering.
    }
  }

  return series;
}

export function summarizeTrades(trades = []) {
  const closedTrades = trades.filter((trade) => trade?.status === "closed");
  const pnlValues = closedTrades
    .map((trade) => trade.pnlPct)
    .filter(isValidPnlPct);
  const rrValues = closedTrades.map((trade) => trade.rr).filter(isValidRR);
  const holdValues = closedTrades
    .map((trade) => trade.holdCandles)
    .filter(isValidHoldCandles);
  const wins = closedTrades.filter((trade) => trade.outcome === "win").length;
  const losses = closedTrades.filter((trade) => trade.outcome === "loss").length;

  let equity = 1;
  let peakEquity = 1;
  let maxDrawdownPct = 0;
  let consecutiveLosses = 0;
  let maxConsecutiveLosses = 0;

  for (const trade of closedTrades) {
    if (isValidPnlPct(trade.pnlPct)) {
      equity = multiplyFinite(equity, 1 + trade.pnlPct / 100);
      peakEquity = Math.max(peakEquity, equity);
      maxDrawdownPct = Math.max(
        maxDrawdownPct,
        ((peakEquity - equity) / peakEquity) * 100,
      );
    }

    if (trade.outcome === "loss") {
      consecutiveLosses += 1;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
    } else {
      consecutiveLosses = 0;
    }
  }

  const grossProfit = pnlValues
    .filter((value) => value > 0)
    .reduce(addFinite, 0);
  const grossLoss = pnlValues
    .filter((value) => value < 0)
    .reduce((total, value) => addFinite(total, Math.abs(value)), 0);
  const average = (values) =>
    values.length === 0
      ? 0
      : values.reduce(addFinite, 0) / values.length;

  return {
    closedTrades: closedTrades.length,
    wins,
    losses,
    winRatePct: closedTrades.length === 0 ? 0 : (wins / closedTrades.length) * 100,
    unfilledTrades: trades.filter((trade) => trade?.status === "unfilled").length,
    maxDrawdownPct: roundMetric(maxDrawdownPct),
    compoundedReturnPct: roundMetric(multiplyFinite(equity - 1, 100)),
    avgRR: roundMetric(average(rrValues)),
    expectancyPct: roundMetric(average(pnlValues)),
    profitFactor: grossLoss === 0 ? 0 : roundMetric(grossProfit / grossLoss),
    averageHoldCandles: roundMetric(average(holdValues)),
    maxConsecutiveLosses,
  };
}

export function groupSummaries(trades = [], key) {
  if (!["symbol", "mode"].includes(key)) {
    throw new TypeError("Invalid summary group");
  }

  return Object.fromEntries(
    Object.entries(Object.groupBy(trades, (trade) => trade?.[key] ?? "")).map(
      ([group, groupedTrades]) => [group, summarizeTrades(groupedTrades)],
    ),
  );
}
