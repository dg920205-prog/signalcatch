export function formatPrice(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US", {
        maximumFractionDigits: 4,
        useGrouping: true,
      })
    : "-";
}
