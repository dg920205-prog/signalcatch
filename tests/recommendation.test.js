import assert from "node:assert/strict";
import test from "node:test";

import { buildRecommendation } from "../js/analysis/recommendation.js";

const analysis = {
  direction: "bull",
  close: 100,
  atr: 4,
  confidence: 82,
};

test("buildRecommendation returns daily split plan and full-data note", () => {
  const result = buildRecommendation({
    analysis,
    mode: "daily",
    modeResults: { daily: { eligible: true } },
    marketProfile: { source: "full", turnover24h: 300_000_000, marketCapSharePct: 2.4, bybitSharePct: 3.5 },
  });

  assert.equal(result.label, "추천");
  assert.equal(result.plan.direction, "bull");
  assert.equal(Array.isArray(result.split.entries), true);
  assert.equal(result.notes[0], "전체 데이터 반영");
});

test("buildRecommendation falls back when profile data is missing", () => {
  const result = buildRecommendation({
    analysis,
    mode: "swing",
    modeResults: { swing: { eligible: false } },
    marketProfile: { source: "fallback" },
  });

  assert.equal(result.label, "주의");
  assert.equal(result.notes[0], "Bybit 기준 임시 산정");
});
