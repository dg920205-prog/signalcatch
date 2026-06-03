const SYMBOLS = {
  BTC: "BYBIT:BTCUSDT.P",
  ETH: "BYBIT:ETHUSDT.P",
  "BTC/ETH": "BINANCE:BTCETH",
  "BTC.D": "CRYPTOCAP:BTC.D",
  "USDT.D": "CRYPTOCAP:USDT.D",
  "OTHERS.D": "CRYPTOCAP:OTHERS.D",
  OTHERS: "CRYPTOCAP:OTHERS",
  TOTAL3ES: "CRYPTOCAP:TOTAL3ES",
};

export function tradingViewReferenceUrl(symbol, { compact = false } = {}) {
  const mapped = SYMBOLS[symbol];
  if (!mapped) {
    throw new Error("Unsupported TradingView reference symbol.");
  }
  const params = new URLSearchParams({
    symbol: mapped,
    interval: "240",
    theme: "dark",
    style: "1",
    locale: "en",
    hide_top_toolbar: compact ? "1" : "0",
    hide_side_toolbar: "1",
    withdateranges: compact ? "0" : "1",
    saveimage: "0",
  });
  return `https://s.tradingview.com/widgetembed/?${params.toString()}`;
}
