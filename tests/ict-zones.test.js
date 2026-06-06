import { test } from "node:test";
import assert from "node:assert/strict";
import { detectFvgs, detectOrderBlocks, detectSweeps, buildIctZones, selectEntryZone } from "../js/analysis/ict-zones.js";

function c(open, high, low, close, volume = 100) {
  return { open, high, low, close, volume };
}

test("detectFvgs returns empty for short or invalid input", () => {
  assert.deepEqual(detectFvgs(null, { atrValue: 2 }), []);
  assert.deepEqual(detectFvgs([], { atrValue: 2 }), []);
  assert.deepEqual(detectFvgs([c(1, 2, 0.5, 1.5)], { atrValue: 2 }), []);
});

test("detectFvgs detects bullish FVG (c2.low > c0.high)", () => {
  const candles = [
    c(100, 100, 98, 99),
    c(99, 110, 99, 109, 500),
    c(109, 112, 105, 110),
  ];
  const fvgs = detectFvgs(candles, { atrValue: 2 });
  assert.equal(fvgs.length, 1);
  assert.equal(fvgs[0].type, "bullish");
  assert.equal(fvgs[0].bottom, 100);
  assert.equal(fvgs[0].top, 105);
  assert.equal(fvgs[0].ce, 102.5);
});

test("detectFvgs detects bearish FVG (c2.high < c0.low)", () => {
  const candles = [
    c(100, 102, 100, 101),
    c(101, 101, 90, 91, 500),
    c(91, 95, 88, 90),
  ];
  const fvgs = detectFvgs(candles, { atrValue: 2 });
  assert.equal(fvgs.length, 1);
  assert.equal(fvgs[0].type, "bearish");
  assert.equal(fvgs[0].top, 100);
  assert.equal(fvgs[0].bottom, 95);
});

test("detectFvgs rejects FVG when displacement body below ATR threshold", () => {
  const candles = [
    c(100, 100, 98, 99),
    c(99, 101, 99, 100, 500),
    c(100, 112, 105, 110),
  ];
  assert.deepEqual(detectFvgs(candles, { atrValue: 2 }), []);
});

test("detectOrderBlocks derives bullish OB from last bearish candle before displacement", () => {
  const candles = [
    c(95, 96, 94, 95),
    c(102, 102, 98, 99),
    c(99, 110, 99, 109, 500),
    c(109, 112, 105, 110),
  ];
  const obs = detectOrderBlocks(candles, { atrValue: 2 });
  assert.ok(obs.length >= 1, "expected at least one OB");
  const bull = obs.find((o) => o.type === "bullish");
  assert.ok(bull, "expected a bullish OB");
  assert.equal(bull.index, 1);
});

test("detectSweeps detects bullish sweep (pierces swing low, closes above)", () => {
  const candles = [
    c(110, 111, 109, 110),
    c(110, 111, 105, 106),
    c(106, 107, 95, 96),
    c(96, 97, 90, 91),
    c(91, 100, 91, 99),
    c(99, 105, 98, 104),
    c(104, 106, 88, 103),
    c(103, 108, 102, 107),
    c(107, 110, 106, 109),
  ];
  const sweeps = detectSweeps(candles, { swingLookback: 2 });
  const bull = sweeps.find((s) => s.type === "bullish");
  assert.ok(bull, "expected a bullish sweep");
  assert.equal(bull.index, 6);
});

test("detectSweeps returns empty for short input", () => {
  assert.deepEqual(detectSweeps([c(1, 2, 0.5, 1.5)], { swingLookback: 2 }), []);
  assert.deepEqual(detectSweeps(null, { swingLookback: 2 }), []);
});

test("buildIctZones returns empty for short input", () => {
  assert.deepEqual(buildIctZones({ candles: null, atrValue: 2 }), []);
  assert.deepEqual(buildIctZones({ candles: [], atrValue: 2 }), []);
});

test("buildIctZones scores a base OB zone at minimum confidence 1", () => {
  const candles = [
    c(95, 96, 94, 95),
    c(102, 102, 98, 99),
    c(99, 110, 99, 109, 500),
    c(109, 112, 105, 110),
    c(110, 113, 108, 111),
    c(111, 114, 109, 112),
  ];
  const zones = buildIctZones({ candles, atrValue: 2, trendBias: null });
  const ob = zones.find((z) => z.type === "bullish" && (z.kind === "ob" || z.kind === "bpr"));
  assert.ok(ob, "expected a bullish OB/bpr zone");
  assert.ok(ob.confidence >= 1);
});

test("buildIctZones adds sweep bonus (+2) to confidence", () => {
  const candles = [
    c(120, 121, 119, 120),
    c(120, 121, 110, 111),
    c(111, 112, 100, 101),
    c(101, 102, 95, 96),
    c(96, 100, 96, 99),
    c(99, 104, 98, 103),
    c(103, 105, 90, 102),
    c(108, 108, 104, 105),
    c(105, 120, 105, 119, 800),
    c(119, 122, 114, 120),
    c(120, 124, 118, 122),
    c(122, 126, 120, 124),
  ];
  const zones = buildIctZones({ candles, atrValue: 3, trendBias: "bull" });
  const swept = zones.find((z) => z.type === "bullish" && z.hasSweep);
  if (swept) {
    assert.ok(swept.confidence >= 3, `expected confidence >=3 with sweep, got ${swept.confidence}`);
  } else {
    console.log("NO SWEPT ZONE. zones:", JSON.stringify(zones));
    console.log("sweeps:", JSON.stringify(detectSweeps(candles, {})));
    assert.fail("fixture did not produce a swept bullish zone — report output for fixture adjustment");
  }
});

test("buildIctZones marks zone mitigated when later candle wicks into it", () => {
  const candles = [
    c(95, 96, 94, 95),
    c(102, 102, 98, 99),
    c(99, 110, 99, 109, 500),
    c(109, 112, 105, 110),
    c(110, 111, 100, 101),
    c(101, 105, 100, 104),
  ];
  const zones = buildIctZones({ candles, atrValue: 2 });
  const ob = zones.find((z) => z.bottom === 98 && z.top === 102);
  assert.ok(ob, "expected the OB zone [98,102]");
  assert.equal(ob.mitigated, true);
});

test("selectEntryZone returns null when no zone meets minConfidence", () => {
  const zones = [
    { type: "bullish", top: 100, bottom: 98, mitigated: false, confidence: 2, index: 5 },
  ];
  assert.equal(selectEntryZone({ zones, direction: "bull", referencePrice: 110, minConfidence: 3 }), null);
});

test("selectEntryZone picks highest-confidence unmitigated zone below price for bull", () => {
  const zones = [
    { type: "bullish", top: 100, bottom: 98, ce: 99, mitigated: false, confidence: 3, index: 5 },
    { type: "bullish", top: 95, bottom: 93, ce: 94, mitigated: false, confidence: 5, index: 7 },
    { type: "bullish", top: 90, bottom: 88, ce: 89, mitigated: true, confidence: 6, index: 9 },
    { type: "bearish", top: 120, bottom: 118, ce: 119, mitigated: false, confidence: 9, index: 3 },
  ];
  const picked = selectEntryZone({ zones, direction: "bull", referencePrice: 110, minConfidence: 3 });
  assert.ok(picked);
  assert.equal(picked.confidence, 5);
  assert.equal(picked.bottom, 93);
});

test("selectEntryZone excludes zones above reference price for bull", () => {
  const zones = [
    { type: "bullish", top: 115, bottom: 113, ce: 114, mitigated: false, confidence: 5, index: 5 },
  ];
  assert.equal(selectEntryZone({ zones, direction: "bull", referencePrice: 110, minConfidence: 3 }), null);
});
