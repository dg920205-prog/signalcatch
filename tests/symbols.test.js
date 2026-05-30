import test from "node:test";
import assert from "node:assert/strict";

import { normalizeBaseSymbol, toUsdtSymbol } from "../js/core/symbols.js";

test("normalizes a base symbol", () => {
  assert.equal(normalizeBaseSymbol(" hbar "), "HBAR");
});

test("removes an existing USDT suffix", () => {
  assert.equal(normalizeBaseSymbol("hbarusdt"), "HBAR");
});

test("creates a USDT trading symbol", () => {
  assert.equal(toUsdtSymbol("hbar"), "HBARUSDT");
});

test("rejects unsafe symbol characters", () => {
  assert.throws(() => normalizeBaseSymbol("<img src=x>"), /허용되지 않는 종목명/);
});

test("rejects an empty symbol", () => {
  assert.throws(() => normalizeBaseSymbol(""), /종목명을 입력/);
});
