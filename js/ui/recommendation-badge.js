const BADGES = {
  "추천": "✅ 추천",
  "주의": "⚠️ 주의",
  "비추천": "⛔ 비추천",
};

export function recommendationBadge(label) {
  return BADGES[label] ?? BADGES["비추천"];
}
