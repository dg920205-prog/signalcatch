function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isValidRR(value) {
  return isFiniteNumber(value) && value >= 0;
}

function isValidHoldCandles(value) {
  return Number.isInteger(value) && value >= 0;
}

function roundMetric(value) {
  return Number(value.toFixed(12));
}

export function summarizeTrades(trades = []) {
  const closedTrades = trades.filter((trade) => trade?.status === "closed");
  const pnlValues = closedTrades
    .map((trade) => trade.pnlPct)
    .filter(isFiniteNumber);
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
    if (isFiniteNumber(trade.pnlPct)) {
      equity *= 1 + trade.pnlPct / 100;
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
    .reduce((total, value) => total + value, 0);
  const grossLoss = pnlValues
    .filter((value) => value < 0)
    .reduce((total, value) => total + Math.abs(value), 0);
  const average = (values) =>
    values.length === 0
      ? 0
      : values.reduce((total, value) => total + value, 0) / values.length;

  return {
    closedTrades: closedTrades.length,
    wins,
    losses,
    winRatePct: closedTrades.length === 0 ? 0 : (wins / closedTrades.length) * 100,
    unfilledTrades: trades.filter((trade) => trade?.status === "unfilled").length,
    maxDrawdownPct: roundMetric(maxDrawdownPct),
    compoundedReturnPct: roundMetric((equity - 1) * 100),
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
