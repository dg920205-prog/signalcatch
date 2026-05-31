const CSV_COLUMNS = [
  "symbol",
  "mode",
  "status",
  "outcome",
  "signalIndex",
  "signalTime",
  "entryPrice",
  "exitPrice",
  "pnlPct",
  "rr",
  "holdCandles",
];

const FORMULA_PREFIX = /^[=+\-@\t\r\n＝＋－＠]/;

function guardFormula(value) {
  if (
    typeof value === "string" &&
    FORMULA_PREFIX.test(value.trimStart())
  ) {
    return `'${value}`;
  }

  return value;
}

function escapeCsv(value) {
  if (value === undefined || value === null) {
    return "";
  }

  const text = String(guardFormula(value));

  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function tradesToCsv(trades = []) {
  return [
    CSV_COLUMNS.join(","),
    ...trades.map((trade) =>
      CSV_COLUMNS.map((column) => escapeCsv(trade?.[column])).join(","),
    ),
  ].join("\r\n");
}
