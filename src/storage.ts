import { scoresSchema } from "../shared/validation";
import type { Catalog, Score } from "../shared/types";
import { rating } from "../shared/rating";
const KEY = "maicoach.scores.v1";
export function readScores(): Score[] {
  return scoresSchema.parse(JSON.parse(localStorage.getItem(KEY) || "[]"));
}
export function saveScores(scores: Score[]) {
  localStorage.setItem(KEY, JSON.stringify(scores));
}
export function importScores(value: unknown, catalog: Catalog): Score[] {
  const input =
    value && typeof value === "object" && "scores" in value
      ? (value as { scores: unknown }).scores
      : value;
  if (
    value &&
    typeof value === "object" &&
    "region" in value &&
    value.region !== "intl"
  )
    throw new Error("This file is not for the international region.");
  const scores = scoresSchema.parse(input);
  const charts = new Map(catalog.charts.map((c) => [c.id, c]));
  const unknown = scores.filter((s) => !charts.has(s.chartId));
  if (unknown.length)
    throw new Error(
      `${unknown.length} chart IDs are not in the international catalog. Nothing was imported.`,
    );
  const best = new Map<string, Score>();
  for (const s of scores) {
    const chart = charts.get(s.chartId)!;
    const prior = best.get(s.chartId);
    if (
      !prior ||
      rating(chart.constant, s.achievement, s.combo) >
        rating(chart.constant, prior.achievement, prior.combo) ||
      (rating(chart.constant, s.achievement, s.combo) ===
        rating(chart.constant, prior.achievement, prior.combo) &&
        s.achievement > prior.achievement)
    )
      best.set(s.chartId, s);
  }
  return [...best.values()];
}
export function makeDemo(catalog: Catalog): Score[] {
  // Deliberately synthetic. Real chart identities, illustrative achievement values.
  const old = catalog.charts
    .filter(
      (c) =>
        c.bucket === "old" &&
        c.constant >= 12.7 &&
        c.constant <= 13.9 &&
        ["expert", "master", "remaster"].includes(c.difficulty),
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 45);
  const recent = catalog.charts
    .filter(
      (c) => c.bucket === "new" && c.constant >= 12.7 && c.constant <= 13.9,
    )
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 20);
  return [...old, ...recent].map((c, i) => ({
    chartId: c.id,
    achievement: [
      99.4215, 98.7362, 100.1324, 97.8251, 99.8732, 100.4216, 98.9642,
    ][i % 7],
    combo: i % 4 === 0 ? "fc" : "none",
  }));
}
export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
