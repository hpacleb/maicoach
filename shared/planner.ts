import { best50, rating } from "./rating";
import type { Chart, PracticePlan, Score, Settings } from "./types";
const milestones = [97, 98, 99, 99.5, 100, 100.5];
export function createPlan(
  charts: Chart[],
  inputScores: Score[],
  settings: Settings,
): PracticePlan {
  const known = new Map<string, Score>();
  const chartIndex = new Map(charts.map((c) => [c.id, c]));
  for (const s of inputScores) {
    const chart = chartIndex.get(s.chartId);
    if (!chart) continue;
    const prior = known.get(s.chartId);
    if (
      !prior ||
      rating(chart.constant, s.achievement, s.combo) >
        rating(chart.constant, prior.achievement, prior.combo) ||
      (rating(chart.constant, s.achievement, s.combo) ===
        rating(chart.constant, prior.achievement, prior.combo) &&
        s.achievement > prior.achievement)
    )
      known.set(s.chartId, s);
  }
  const scores = [...known.values()];
  const before = best50(charts, scores);
  const pool = charts.filter(
    (c) => c.constant >= settings.minLevel && c.constant <= settings.maxLevel,
  );
  const slots: PracticePlan["slots"] = [];
  const selected = new Set<string>();
  let projected = [...scores];
  const maxSlots = settings.credits * 3;
  for (let i = 0; i < maxSlots; i++) {
    const phase =
      i < Math.max(1, Math.floor(maxSlots / 6))
        ? "warmup"
        : i >= maxSlots - Math.max(1, Math.floor(maxSlots / 5))
          ? "explore"
          : "push";
    const currentB50 = best50(charts, projected);
    const included = new Map(
      [...currentB50.old, ...currentB50.recent].map((e) => [
        e.chart.id,
        e.value,
      ]),
    );
    const candidates = pool
      .filter((c) => !selected.has(c.id))
      .map((chart) => {
        const score = known.get(chart.id);
        const target =
          phase === "warmup"
            ? Math.min(score?.achievement ?? 97, 100)
            : score
              ? (milestones.find((t) => t > score.achievement) ?? null)
              : 97;
        if (target === null) return null;
        const bucket =
          chart.bucket === "old" ? currentB50.old : currentB50.recent;
        const capacity = chart.bucket === "old" ? 35 : 15;
        const baseline =
          included.get(chart.id) ??
          (bucket.length < capacity ? 0 : bucket[bucket.length - 1].value);
        const gain = Math.max(
          0,
          rating(
            chart.constant,
            Math.max(target, score?.achievement ?? 0),
            score?.combo ?? "none",
          ) - baseline,
        );
        const progressGap = score ? target - score.achievement : 2;
        let priority =
          settings.goal === "rating"
            ? gain / Math.max(0.2, progressGap)
            : settings.goal === "consistency"
              ? score
                ? 25 - progressGap * 5
                : 0
              : score
                ? 0
                : 25;
        if (phase === "warmup")
          priority = (score ? 40 : 0) - chart.constant * 2;
        if (phase === "explore")
          priority =
            (score ? 0 : 40) -
            Math.abs(
              chart.constant - (settings.minLevel + settings.maxLevel) / 2,
            );
        if (settings.focus === "slides" || settings.focus === "breaks")
          priority +=
            (10 *
              (chart.notes[settings.focus === "slides" ? "slide" : "break"] ??
                0)) /
            Math.max(1, chart.notes.total ?? 1);
        return { chart, score, target, gain, priority };
      })
      .filter((c) => c !== null)
      .sort(
        (a, b) =>
          b.priority - a.priority || a.chart.id.localeCompare(b.chart.id),
      );
    const pick = candidates[0];
    if (!pick) break;
    selected.add(pick.chart.id);
    projected = [
      ...projected.filter((s) => s.chartId !== pick.chart.id),
      {
        chartId: pick.chart.id,
        achievement: Math.max(pick.target, pick.score?.achievement ?? 0),
        combo: pick.score?.combo ?? "none",
      },
    ];
    const reason =
      phase === "warmup"
        ? "Settle into the session with a lower-constant chart in your range."
        : phase === "explore"
          ? "Build a baseline on a different chart. Adjust this target after your first play."
          : pick.score
            ? `${(pick.target - pick.score.achievement).toFixed(4)}% to the next achievement milestone${settings.goal === "rating" ? "; prioritized by projected B50 gain per achievement gap" : ""}.`
            : "No score recorded yet. This target is an assumption; your first result will improve future plans.";
    slots.push({
      chart: pick.chart,
      phase,
      target: pick.target,
      current: pick.score?.achievement ?? null,
      gain: pick.gain,
      reason,
      drillId: phase === "push" ? settings.focus : phase,
    });
  }
  return {
    slots,
    totalBefore: before.total,
    totalAfter: best50(charts, projected).total,
    recordedCount: before.count,
    settings,
    notices: [
      ...(before.count < 50
        ? [
            `Partial B50: ${before.old.length}/35 old charts and ${before.recent.length}/15 recent-version charts. This is the total of your recorded scores, not a verified account rating.`,
          ]
        : []),
      "Projected gains assume every target is achieved. They are calculated sequentially with B35/B15 replacement, not promised results.",
      ...(slots.some((s) => s.current === null)
        ? [
            "Unplayed charts use a provisional 97% target; it is not a prediction of your ability.",
          ]
        : []),
      ...(slots.length < maxSlots
        ? [
            "Your level range has too few eligible charts for a full session. Widen the range to add more.",
          ]
        : []),
    ],
  };
}
