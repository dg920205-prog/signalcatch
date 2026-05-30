const SAFE_BASE_SYMBOL = /^[A-Z0-9]{2,20}$/;

export function normalizeBaseSymbol(input) {
  const rawSymbol = String(input ?? "").trim();

  if (!rawSymbol) {
    throw new Error("종목명을 입력하세요.");
  }

  if (!/^[A-Za-z0-9]+$/.test(rawSymbol)) {
    throw new Error("허용되지 않는 종목명입니다.");
  }

  const baseSymbol = rawSymbol.toUpperCase().replace(/USDT$/, "");

  if (baseSymbol.endsWith("USDT") || !SAFE_BASE_SYMBOL.test(baseSymbol)) {
    throw new Error("허용되지 않는 종목명입니다.");
  }

  return baseSymbol;
}

export function toUsdtSymbol(input) {
  return `${normalizeBaseSymbol(input)}USDT`;
}
