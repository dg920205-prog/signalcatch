const COINGECKO_IDS = Object.freeze({
  ADA: "cardano",
  BTC: "bitcoin",
  DOGE: "dogecoin",
  ETH: "ethereum",
  HBAR: "hedera-hashgraph",
  SOL: "solana",
  XRP: "ripple",
});

export function coinGeckoId(symbol) {
  const normalized = String(symbol ?? "").trim().toUpperCase();
  return COINGECKO_IDS[normalized] ?? normalized.toLowerCase();
}

function turnoverSharePct(symbol, tickers = []) {
  let total = 0;
  let selected = 0;
  for (const ticker of tickers) {
    const turnover = Number(ticker?.turnover24h);
    if (!Number.isFinite(turnover) || turnover < 0) continue;
    total += turnover;
    if (ticker?.symbol === symbol) selected = turnover;
  }
  return total > 0 ? (selected / total) * 100 : null;
}

async function defaultFetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Market profile request failed.");
  return response.json();
}

async function defaultWait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMarketProfileLoader({
  fetchJson = defaultFetchJson,
  now = Date.now,
  wait = defaultWait,
  ttlMs = 300_000,
} = {}) {
  const cache = new Map();

  async function retry(url) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await fetchJson(url);
      } catch (error) {
        lastError = error;
        if (attempt === 0) await wait(100);
      }
    }
    throw lastError;
  }

  async function request(symbol) {
    const normalized = String(symbol ?? "").trim().toUpperCase();
    const usdtSymbol = `${normalized}USDT`;
    const profile = {
      source: "fallback",
      turnover24h: null,
      marketCapSharePct: null,
      bybitSharePct: null,
    };

    try {
      const payload = await retry(
        "https://api.bybit.com/v5/market/tickers?category=linear",
      );
      const tickers = Array.isArray(payload?.result?.list)
        ? payload.result.list
        : [];
      const ticker = tickers.find((item) => item?.symbol === usdtSymbol);
      const turnover = Number(ticker?.turnover24h);
      if (Number.isFinite(turnover) && turnover >= 0) {
        profile.turnover24h = turnover;
      }
      profile.bybitSharePct = turnoverSharePct(usdtSymbol, tickers);
    } catch {
      // Bybit profile data is optional.
    }

    try {
      const [coin, global] = await Promise.all([
        retry(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(coinGeckoId(normalized))}`,
        ),
        retry("https://api.coingecko.com/api/v3/global"),
      ]);
      const marketCap = Number(coin?.[0]?.market_cap);
      const totalCap = Number(global?.data?.total_market_cap?.usd);
      if (Number.isFinite(marketCap) && Number.isFinite(totalCap) && totalCap > 0) {
        profile.marketCapSharePct = (marketCap / totalCap) * 100;
        profile.source = "full";
      }
    } catch {
      // CoinGecko failure keeps the Bybit-only fallback profile.
    }

    return profile;
  }

  return {
    async load(symbol) {
      const key = String(symbol ?? "").trim().toUpperCase();
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now()) return cached.promise;
      const promise = request(key);
      cache.set(key, { expiresAt: now() + ttlMs, promise });
      return promise;
    },
  };
}
