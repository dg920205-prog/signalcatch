import { analyzeCandles } from "./signals.js";

const DIRECTION_LABELS = {
  bull: "상승",
  bear: "하락",
  neutral: "중립",
};

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
      `BTC 분석 방향: ${DIRECTION_LABELS[btc.direction]}`,
      `ETH 분석 방향: ${DIRECTION_LABELS[eth.direction]}`,
      ...(direction === "neutral" ? ["BTC와 ETH 방향이 일치하지 않습니다."] : []),
    ],
  };
}
