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

const RAW_UNSAFE_PREFIX = /^[=+\-@\t\r\n\uFF1D\uFF0B\uFF0D\uFF20]/;
const FORMULA_PREFIX = /^[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/;

function guardFormula(value) {
  if (
    typeof value === "string" &&
    (RAW_UNSAFE_PREFIX.test(value) || FORMULA_PREFIX.test(value.trimStart()))
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
