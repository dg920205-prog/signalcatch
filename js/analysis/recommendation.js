import { buildSplitTargets, buildTradePlan } from "./trade-plan.js";

function toNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function calculateTurnoverSharePct(symbol, tickers = []) {
  let total = 0;
  let selected = 0;

  for (const ticker of tickers) {
    const turnover = Number(ticker?.turnover24h);
    if (!Number.isFinite(turnover) || turnover < 0) {
      continue;
    }
    total += turnover;
    if (ticker?.symbol === symbol) {
      selected = turnover;
    }
  }

  return total > 0 ? (selected / total) * 100 : null;
}

function normalizeWeights(turnover24h, marketCapSharePct, bybitSharePct) {
  let profileScore = 0;

  if (toNumber(turnover24h) !== null) {
    profileScore += turnover24h >= 200_000_000 ? 2 : turnover24h >= 50_000_000 ? 1 : 0;
  }
  if (toNumber(marketCapSharePct) !== null) {
    profileScore += marketCapSharePct >= 1.5 ? 2 : marketCapSharePct >= 0.2 ? 1 : 0;
  }
  if (toNumber(bybitSharePct) !== null) {
    profileScore += bybitSharePct >= 3 ? 2 : bybitSharePct >= 0.7 ? 1 : 0;
  }

  if (profileScore >= 5) return [0.34, 0.33, 0.33];
  if (profileScore >= 3) return [0.4, 0.35, 0.25];
  return [0.5, 0.3, 0.2];
}

export function buildRecommendation({
  analysis,
  modeResults = {},
  mode = "common",
  marketProfile = {},
} = {}) {
  const confidence = toNumber(analysis?.confidence) ?? 0;
  const eligible = modeResults?.[mode]?.eligible === true;
  const quality =
    confidence >= 75 && eligible
      ? "recommended"
      : confidence >= 60
        ? "caution"
        : "not-recommended";
  const label =
    quality === "recommended"
      ? "추천"
      : quality === "caution"
        ? "주의"
        : "비추천";

  const plan = buildTradePlan(analysis ?? {});
  if (!plan) {
    return { quality, label, plan: null, split: null, notes: ["신호 데이터 부족"] };
  }

  const autoWeights = normalizeWeights(
    toNumber(marketProfile.turnover24h),
    toNumber(marketProfile.marketCapSharePct),
    toNumber(marketProfile.bybitSharePct),
  );
  const split = buildSplitTargets(plan, mode, autoWeights);
  const fallback =
    marketProfile?.source === "fallback"
      ? "Bybit 기준 임시 산정"
      : "전체 데이터 반영";

  return {
    quality,
    label,
    plan,
    split,
    notes: [fallback],
  };
}
