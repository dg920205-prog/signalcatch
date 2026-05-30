const SAFE_BASE_SYMBOL = /^[A-Z0-9]{2,20}$/;

export function normalizeBaseSymbol(input) {
  const symbol = String(input ?? "").trim().toUpperCase().replace(/USDT$/, "");

  if (!symbol) {
    throw new Error("종목명을 입력하세요.");
  }

  if (!SAFE_BASE_SYMBOL.test(symbol)) {
    throw new Error("허용되지 않는 종목명입니다.");
  }

  return symbol;
}

export function toUsdtSymbol(input) {
  return `${normalizeBaseSymbol(input)}USDT`;
}
