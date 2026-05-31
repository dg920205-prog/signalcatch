import assert from "node:assert/strict";
import test from "node:test";

import { tradesToCsv } from "../js/backtest/csv.js";
import { groupSummaries, summarizeTrades } from "../js/backtest/metrics.js";

const trades = [
  {
    symbol: "ETHUSDT",
    mode: "day",
    status: "closed",
    outcome: "win",
    pnlPct: 4,
    rr: 1.5,
    holdCandles: 3,
  },
  {
    symbol: "ETHUSDT",
    mode: "swing",
    status: "closed",
    outcome: "loss",
    pnlPct: -2,
    rr: 1.5,
    holdCandles: 2,
  },
  {
    symbol: "BTCUSDT",
    mode: "day",
    status: "unfilled",
  },
];

test("summarizeTrades calculates portfolio metrics from closed trades", () => {
  assert.deepEqual(summarizeTrades(trades), {
    closedTrades: 2,
    wins: 1,
    losses: 1,
    winRatePct: 50,
    unfilledTrades: 1,
    maxDrawdownPct: 2,
    compoundedReturnPct: 1.92,
    avgRR: 1.5,
    expectancyPct: 1,
    profitFactor: 2,
    averageHoldCandles: 2.5,
    maxConsecutiveLosses: 1,
  });
});

test("groupSummaries calculates metrics by symbol and mode", () => {
  const bySymbol = groupSummaries(trades, "symbol");
  const byMode = groupSummaries(trades, "mode");

  assert.equal(bySymbol.ETHUSDT.closedTrades, 2);
  assert.equal(bySymbol.ETHUSDT.compoundedReturnPct, 1.92);
  assert.equal(bySymbol.BTCUSDT.unfilledTrades, 1);
  assert.equal(byMode.day.closedTrades, 1);
  assert.equal(byMode.day.unfilledTrades, 1);
  assert.equal(byMode.swing.losses, 1);
});

test("summarizeTrades returns stable zero values for no trades", () => {
  assert.deepEqual(summarizeTrades([]), {
    closedTrades: 0,
    wins: 0,
    losses: 0,
    winRatePct: 0,
    unfilledTrades: 0,
    maxDrawdownPct: 0,
    compoundedReturnPct: 0,
    avgRR: 0,
    expectancyPct: 0,
    profitFactor: 0,
    averageHoldCandles: 0,
    maxConsecutiveLosses: 0,
  });
  assert.deepEqual(groupSummaries([], "symbol"), {});
});

test("summarizeTrades excludes malformed numeric fields from calculations", () => {
  const malformed = [
    { status: "closed", outcome: "win", pnlPct: 4, rr: 2, holdCandles: 3 },
    { status: "closed", outcome: "loss", pnlPct: Number.NaN, rr: "4", holdCandles: -1 },
    { status: "closed", outcome: "loss", pnlPct: "-20", rr: Number.POSITIVE_INFINITY, holdCandles: 1.5 },
    { status: "closed", outcome: "loss", pnlPct: Number.NEGATIVE_INFINITY, rr: -1, holdCandles: "2" },
  ];

  assert.deepEqual(summarizeTrades(malformed), {
    closedTrades: 4,
    wins: 1,
    losses: 3,
    winRatePct: 25,
    unfilledTrades: 0,
    maxDrawdownPct: 0,
    compoundedReturnPct: 4,
    avgRR: 2,
    expectancyPct: 4,
    profitFactor: 0,
    averageHoldCandles: 3,
    maxConsecutiveLosses: 3,
  });
});

test("summarizeTrades excludes out-of-range numeric fields and returns finite metrics", () => {
  const summary = summarizeTrades([
    { status: "closed", outcome: "win", pnlPct: 4, rr: 2, holdCandles: 3 },
    {
      status: "closed",
      outcome: "win",
      pnlPct: Number.MAX_VALUE,
      rr: Number.MAX_VALUE,
      holdCandles: Number.MAX_SAFE_INTEGER + 1,
    },
    {
      status: "closed",
      outcome: "loss",
      pnlPct: Number.MAX_VALUE,
      rr: 100.01,
      holdCandles: Number.MAX_VALUE,
    },
  ]);

  assert.deepEqual(summary, {
    closedTrades: 3,
    wins: 2,
    losses: 1,
    winRatePct: 2 / 3 * 100,
    unfilledTrades: 0,
    maxDrawdownPct: 0,
    compoundedReturnPct: 4,
    avgRR: 2,
    expectancyPct: 4,
    profitFactor: 0,
    averageHoldCandles: 3,
    maxConsecutiveLosses: 1,
  });
  assert.ok(Object.values(summary).every(Number.isFinite));
});

test("summarizeTrades keeps derived metrics finite when valid returns compound beyond numeric limits", () => {
  const summary = summarizeTrades(
    Array.from({ length: 200 }, () => ({
      status: "closed",
      outcome: "win",
      pnlPct: 10000,
      rr: 100,
      holdCandles: Number.MAX_SAFE_INTEGER,
    })),
  );

  assert.ok(Object.values(summary).every(Number.isFinite));
});

test("tradesToCsv exports explicit columns in a stable order", () => {
  assert.equal(
    tradesToCsv([
      {
        symbol: "ETHUSDT",
        mode: "day",
        signalIndex: 7,
        signalTime: "2026-05-30T00:00:00Z",
        status: "closed",
        outcome: "win",
        entryPrice: 100,
        exitPrice: 104,
        pnlPct: 4,
        rr: 1.5,
        holdCandles: 3,
      },
    ]),
    [
      "symbol,mode,status,outcome,signalIndex,signalTime,entryPrice,exitPrice,pnlPct,rr,holdCandles",
      "'ETHUSDT,'day,'closed,'win,7,'2026-05-30T00:00:00Z,100,104,4,1.5,3",
    ].join("\r\n"),
  );
});

test("tradesToCsv escapes quotes and line breaks", () => {
  assert.equal(
    tradesToCsv([{ symbol: 'ETH,"line\r\nbreak"', mode: "day" }]),
    [
      "symbol,mode,status,outcome,signalIndex,signalTime,entryPrice,exitPrice,pnlPct,rr,holdCandles",
      '"\'ETH,""linebreak""",\'day,,,,,,,,,',
    ].join("\r\n"),
  );
});

test("tradesToCsv prefixes formula-like string cells before CSV escaping", () => {
  const attacks = [
    "=1+1",
    "+cmd",
    "-2+3",
    "@SUM(A1:A2)",
    "\t=1",
    "\r=1",
    "\n=1",
    "\tcmd",
    "\rcmd",
    "\ncmd",
    "  =trimmed",
    "＝1+1",
    "＋cmd",
    "－2+3",
    "＠SUM(A1:A2)",
  ];
  const csv = tradesToCsv(attacks.map((symbol) => ({ symbol })));

  for (const attack of attacks) {
    const sanitized = attack.replace(/[\u0000-\u001F\u007F]|\p{Cf}/gu, "");
    const escaped = `'${sanitized}`.replaceAll('"', '""');
    const expectedCell = /[",\r\n]/.test(escaped) ? `"${escaped}"` : escaped;
    assert.ok(csv.includes(`${expectedCell},`), `missing escaped cell for ${attack}`);
  }
});

test("tradesToCsv removes hidden prefixes before formula injection checks", () => {
  const csv = tradesToCsv([
    { symbol: "\u0000=1" },
    { symbol: "\u001f=1" },
    { symbol: "\u200b=1" },
  ]);

  assert.equal(
    csv,
    [
      "symbol,mode,status,outcome,signalIndex,signalTime,entryPrice,exitPrice,pnlPct,rr,holdCandles",
      "'=1,,,,,,,,,,",
      "'=1,,,,,,,,,,",
      "'=1,,,,,,,,,,",
    ].join("\r\n"),
  );
});

test("tradesToCsv prefixes every sanitized string cell but not trusted headers or safe primitives", () => {
  assert.equal(
    tradesToCsv([
      {
        symbol: "ETHUSDT",
        mode: "'day",
        status: "",
        signalIndex: 7,
        signalTime: true,
        entryPrice: null,
      },
    ]),
    [
      "symbol,mode,status,outcome,signalIndex,signalTime,entryPrice,exitPrice,pnlPct,rr,holdCandles",
      "'ETHUSDT,''day,',,7,true,,,,,",
    ].join("\r\n"),
  );
});

test("tradesToCsv removes Unicode format characters before prefixing text cells", () => {
  const csv = tradesToCsv([
    { symbol: "\u200e=1" },
    { symbol: "\u200f=1" },
    { symbol: "\u202a=1" },
    { symbol: "\u2066=1" },
    { symbol: "\u00ad=1" },
  ]);

  assert.equal(
    csv,
    [
      "symbol,mode,status,outcome,signalIndex,signalTime,entryPrice,exitPrice,pnlPct,rr,holdCandles",
      "'=1,,,,,,,,,,",
      "'=1,,,,,,,,,,",
      "'=1,,,,,,,,,,",
      "'=1,,,,,,,,,,",
      "'=1,,,,,,,,,,",
    ].join("\r\n"),
  );
});
