import type { Chart, Score } from "./types";
// DXRating's coefficient table, including the 0.0001% boundary steps.
// Reference: https://github.com/gekichumai/dxrating/blob/8d82f8d997a5d31664c4cd0f0c9a7d86c809ebfc/packages/maimai-domain/src/best50.ts
const coefficients = [
  [0, 0],
  [10, 1.6],
  [20, 3.2],
  [30, 4.8],
  [40, 6.4],
  [50, 8],
  [60, 9.6],
  [70, 11.2],
  [75, 12],
  [79.9999, 12.8],
  [80, 13.6],
  [90, 15.2],
  [94, 16.8],
  [96.9999, 17.6],
  [97, 20],
  [98, 20.3],
  [98.9999, 20.6],
  [99, 20.8],
  [99.5, 21.1],
  [99.9999, 21.4],
  [100, 21.6],
  [100.4999, 22.2],
  [100.5, 22.4],
];
export function rating(
  constant: number,
  achievement: number,
  combo: Score["combo"] = "none",
): number {
  if (
    !Number.isFinite(constant) ||
    constant <= 0 ||
    constant > 15 ||
    !Number.isFinite(achievement) ||
    achievement < 0 ||
    achievement > 101
  )
    throw new RangeError("Invalid rating input");
  const units = Math.min(1005000, Math.round(achievement * 10000));
  const coeff = [...coefficients]
    .reverse()
    .find(([threshold]) => units >= Math.round(threshold * 10000))![1];
  return (
    Math.floor(
      (Math.round(constant * 10) * units * Math.round(coeff * 10)) / 100000000,
    ) + (combo === "ap" || combo === "app" ? 1 : 0)
  );
}
export function rank(achievement: number): string {
  return achievement >= 100.5
    ? "SSS+"
    : achievement >= 100
      ? "SSS"
      : achievement >= 99.5
        ? "SS+"
        : achievement >= 99
          ? "SS"
          : achievement >= 98
            ? "S+"
            : achievement >= 97
              ? "S"
              : achievement >= 94
                ? "AAA"
                : achievement >= 90
                  ? "AA"
                  : achievement >= 80
                    ? "A"
                    : "—";
}
export function best50(charts: Chart[], scores: Score[]) {
  const index = new Map(charts.map((c) => [c.id, c]));
  const best = new Map<string, { score: Score; chart: Chart; value: number }>();
  for (const score of scores) {
    const chart = index.get(score.chartId);
    if (!chart) continue;
    const value = rating(chart.constant, score.achievement, score.combo);
    if (
      !best.has(chart.id) ||
      value > best.get(chart.id)!.value ||
      (value === best.get(chart.id)!.value &&
        score.achievement > best.get(chart.id)!.score.achievement)
    )
      best.set(chart.id, { score, chart, value });
  }
  const entries = [...best.values()].sort(
    (a, b) => b.value - a.value || a.chart.id.localeCompare(b.chart.id),
  );
  const old = entries.filter((e) => e.chart.bucket === "old").slice(0, 35);
  const recent = entries.filter((e) => e.chart.bucket === "new").slice(0, 15);
  return {
    old,
    recent,
    total: [...old, ...recent].reduce((sum, e) => sum + e.value, 0),
    count: old.length + recent.length,
  };
}
