import assert from "node:assert/strict";
import test from "node:test";

import { coinGeckoId, createMarketProfileLoader } from "../js/analysis/market-profile.js";

test("coinGeckoId maps symbols whose API ids differ from ticker symbols", () => {
  assert.equal(coinGeckoId("HBAR"), "hedera-hashgraph");
  assert.equal(coinGeckoId("BTC"), "bitcoin");
  assert.equal(coinGeckoId("XRP"), "ripple");
});

test("coinGeckoId returns a lowercase fallback for unknown safe symbols", () => {
  assert.equal(coinGeckoId("NEWCOIN"), "newcoin");
});

test("createMarketProfileLoader caches successful profile requests", async () => {
  let calls = 0;
  const loader = createMarketProfileLoader({
    fetchJson: async (url) => {
      calls += 1;
      if (url.includes("api.bybit.com")) {
        return { result: { list: [{ symbol: "HBARUSDT", turnover24h: "200" }, { symbol: "BTCUSDT", turnover24h: "800" }] } };
      }
      if (url.includes("/global")) {
        return { data: { total_market_cap: { usd: 1000 } } };
      }
      return [{ market_cap: 20 }];
    },
    now: () => 1000,
  });

  const first = await loader.load("HBAR");
  const second = await loader.load("HBAR");

  assert.deepEqual(second, first);
  assert.equal(first.bybitSharePct, 20);
  assert.equal(first.marketCapSharePct, 2);
  assert.equal(calls, 3);
});

test("createMarketProfileLoader retries failures and falls back to Bybit data", async () => {
  let bybitCalls = 0;
  const loader = createMarketProfileLoader({
    fetchJson: async (url) => {
      if (url.includes("api.bybit.com")) {
        bybitCalls += 1;
        if (bybitCalls === 1) throw new Error("temporary");
        return { result: { list: [{ symbol: "HBARUSDT", turnover24h: "100" }] } };
      }
      throw new Error("coingecko unavailable");
    },
    wait: async () => {},
  });

  const profile = await loader.load("HBAR");

  assert.equal(bybitCalls, 2);
  assert.equal(profile.source, "fallback");
  assert.equal(profile.turnover24h, 100);
  assert.equal(profile.bybitSharePct, 100);
});
