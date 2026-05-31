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
const HIDDEN_CHARACTERS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g;

function guardFormula(value) {
  if (typeof value === "string") {
    const sanitized = value.replace(HIDDEN_CHARACTERS, "");

    if (
      RAW_UNSAFE_PREFIX.test(value) ||
      FORMULA_PREFIX.test(sanitized.trimStart())
    ) {
      return `'${sanitized}`;
    }

    return sanitized;
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
