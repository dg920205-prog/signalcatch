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

const UNSAFE_CHARACTERS = /[\u0000-\u001F\u007F]|\p{Cf}/gu;

function sanitizeString(value) {
  if (typeof value === "string") {
    return `'${value.replace(UNSAFE_CHARACTERS, "")}`;
  }

  return value;
}

function escapeCsv(value) {
  if (value === undefined || value === null) {
    return "";
  }

  const text = String(sanitizeString(value));

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
