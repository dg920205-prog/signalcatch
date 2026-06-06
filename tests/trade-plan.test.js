import { test } from "node:test";
import assert from "node:assert/strict";
import { buildIctTradePlan } from "../js/analysis/trade-plan.js";

const bullZone = { kind: "bpr", type: "bullish", top: 102, bottom: 98, ce: 100, confidence: 5 };
const bearZone = { kind: "ob", type: "bearish", top: 102, bottom: 98, ce: 100, confidence: 4 };

test("buildIctTradePlan returns waiting when no zone", () => {
  const plan = buildIctTradePlan({ direction: "bull", zone: null, atr: 4, mode: "scalp" });
  assert.equal(plan.status, "waiting");
  assert.equal(plan.entryLow, null);
  assert.equal(plan.tp, null);
});

test("buildIctTradePlan returns waiting for invalid direction", () => {
  const plan = buildIctTradePlan({ direction: "neutral", zone: bullZone, atr: 4, mode: "scalp" });
  assert.equal(plan.status, "waiting");
});

test("buildIctTradePlan builds bull plan anchored to zone bounds", () => {
  const plan = buildIctTradePlan({ direction: "bull", zone: bullZone, atr: 4, mode: "scalp" });
  assert.equal(plan.status, "ready");
  assert.equal(plan.entryLow, 98);
  assert.equal(plan.entryHigh, 102);
  assert.equal(plan.sl, 96);
  assert.equal(plan.tp, 114);
  assert.equal(plan.rr, 2);
  assert.equal(plan.zoneKind, "bpr");
  assert.equal(plan.confidence, 5);
});

test("buildIctTradePlan builds bear plan symmetric", () => {
  const plan = buildIctTradePlan({ direction: "bear", zone: bearZone, atr: 4, mode: "day" });
  assert.equal(plan.status, "ready");
  assert.equal(plan.sl, 104);
  assert.equal(plan.tp, 86);
  assert.equal(plan.rr, 2);
});

test("buildIctTradePlan applies mode-differentiated RR", () => {
  const scalp = buildIctTradePlan({ direction: "bull", zone: bullZone, atr: 4, mode: "scalp" });
  const daily = buildIctTradePlan({ direction: "bull", zone: bullZone, atr: 4, mode: "daily" });
  const swing = buildIctTradePlan({ direction: "bull", zone: bullZone, atr: 4, mode: "swing" });
  assert.equal(scalp.rr, 2);
  assert.equal(daily.rr, 3);
  assert.equal(swing.rr, 4);
  assert.ok(swing.tp > daily.tp);
  assert.ok(daily.tp > scalp.tp);
});

test("buildIctTradePlan bull plan satisfies sl<entryLow<entryHigh<tp ordering", () => {
  const plan = buildIctTradePlan({ direction: "bull", zone: bullZone, atr: 4, mode: "swing" });
  assert.ok(plan.sl < plan.entryLow);
  assert.ok(plan.entryLow < plan.entryHigh);
  assert.ok(plan.entryHigh < plan.tp);
});

test("buildIctTradePlan returns waiting for degenerate zone (bottom>=top)", () => {
  const bad = { kind: "ob", type: "bullish", top: 98, bottom: 102, ce: 100, confidence: 5 };
  const plan = buildIctTradePlan({ direction: "bull", zone: bad, atr: 4, mode: "scalp" });
  assert.equal(plan.status, "waiting");
});
