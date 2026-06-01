import { analyzeCandles } from "./signals.js";

export function analyzeMarketRegime({ btcCandles, ethCandles } = {}) {
  const btc = analyzeCandles(btcCandles);
  const eth = analyzeCandles(ethCandles);
  const direction =
    btc.direction === eth.direction && ["bull", "bear"].includes(btc.direction)
      ? btc.direction
      : "neutral";

  return {
    direction,
    reasons: [
      `BTC: ${btc.direction}`,
      `ETH: ${eth.direction}`,
      ...(direction === "neutral" ? ["BTC and ETH are not aligned."] : []),
    ],
  };
}
