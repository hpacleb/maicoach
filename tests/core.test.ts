import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rating, best50 } from "../shared/rating";
import { normalizeCatalog } from "../shared/normalize";
import { createPlan } from "../shared/planner";
import { importScores, makeDemo } from "../src/storage";
import { plannerAdvice, retrieveDrills } from "../server/coach";
import {
  DEFAULT_SETTINGS,
  type Catalog,
  type Chart,
  type Score,
} from "../shared/types";
import { scoreSchema, settingsSchema } from "../shared/validation";
const catalog = JSON.parse(
  readFileSync("data/catalog.json", "utf8"),
) as Catalog;
const chart = (
  id: string,
  bucket: Chart["bucket"] = "old",
  constant = 14,
): Chart => ({ ...catalog.charts[0], id, bucket, constant });

test("rating uses exact boundary coefficients, caps achievement and includes AP bonus", () => {
  assert.equal(rating(14, 100.5), 315);
  assert.equal(rating(14, 101), 315);
  assert.equal(rating(14, 100.5, "ap"), 316);
  assert.equal(rating(14, 100.4998), Math.floor((14 * 100.4998 * 21.6) / 100));
  assert.equal(rating(14, 100.4999), Math.floor((14 * 100.4999 * 22.2) / 100));
  assert.equal(rating(13.7, 99), Math.floor((13.7 * 99 * 20.8) / 100));
  assert.equal(rating(13, 96.9999), Math.floor((13 * 96.9999 * 17.6) / 100));
  assert.throws(() => rating(14, NaN), RangeError);
  assert.throws(() => rating(14, -1), RangeError);
});
test("B50 selects 35 old and 15 new, deduplicates and ignores unknown IDs", () => {
  const charts = [
    ...Array.from({ length: 40 }, (_, i) => chart(`old${i}`)),
    ...Array.from({ length: 20 }, (_, i) => chart(`new${i}`, "new")),
  ];
  const scores: Score[] = charts.map((c) => ({
    chartId: c.id,
    achievement: 100.5,
    combo: "none",
  }));
  scores.push(
    { chartId: "old0", achievement: 100.5, combo: "ap" },
    { chartId: "missing", achievement: 101, combo: "ap" },
  );
  const result = best50(charts, scores);
  assert.equal(result.old.length, 35);
  assert.equal(result.recent.length, 15);
  assert.equal(result.total, 50 * 315 + 1);
});
test("international normalization rejects Japan-only and special charts; overrides win", () => {
  const base = {
    id: "s1",
    type: "dx",
    difficulty: "master",
    level: "14",
    internalLevelValue: 14.4,
    serverIds: ["intl", "jp"],
    isSpecial: false,
    version: "old",
    noteCounts: { total: 100 },
    multiverInternalLevelValue: { current: 14.2 },
  };
  const input = {
    schemaVersion: 1,
    updatedAt: "2026-11-11T00:00:00Z",
    versions: [
      { version: "old" },
      { version: "current" },
      { version: "future" },
    ],
    songs: [
      {
        id: "song",
        title: "Test",
        artist: "Artist",
        category: "maimai",
        sheets: [
          base,
          { ...base, id: "s2", serverIds: ["jp"] },
          { ...base, id: "s3", isSpecial: true },
          { ...base, id: "s4", type: "utage" },
          {
            ...base,
            id: "s5",
            serverOverrides: {
              intl: { level: "13+", levelValue: 13.9, version: "current" },
            },
          },
          { ...base, id: "s6", version: "future" },
        ],
      },
    ],
  };
  const result = normalizeCatalog(input, "current");
  assert.deepEqual(
    result.charts.map((c) => c.id),
    ["s1", "s5", "s6"],
  );
  assert.equal(result.charts[0].constant, 14.2);
  assert.equal(result.charts[1].constant, 13.9);
  assert.equal(result.charts[1].level, "13+");
  assert.equal(result.charts[1].bucket, "new");
  assert.equal(result.charts[2].bucket, "new");
});
test("snapshot is international and contains distinct eligible chart identities", () => {
  assert.equal(catalog.region, "intl");
  assert.ok(catalog.charts.length > 6000);
  assert.equal(
    new Set(catalog.charts.map((c) => c.id)).size,
    catalog.charts.length,
  );
  assert.ok(
    catalog.charts.every(
      (c) =>
        ["dx", "std"].includes(c.type) && c.constant > 0 && c.constant <= 15,
    ),
  );
});
test("CiRCLE PLUS B15 includes CiRCLE and CiRCLE PLUS, plus later charts available internationally", () => {
  const base = {
    type: "dx",
    difficulty: "master",
    level: "14",
    internalLevelValue: 14,
    serverIds: ["intl"],
    isSpecial: false,
    noteCounts: { total: 100 },
  };
  const input = {
    schemaVersion: 1,
    updatedAt: "2026-11-11T00:00:00Z",
    versions: ["PRiSM PLUS", "CiRCLE", "CiRCLE PLUS", "MAGiCAL"].map(
      (version) => ({ version }),
    ),
    songs: [
      {
        id: "song",
        title: "Test",
        artist: "A",
        category: "maimai",
        sheets: ["PRiSM PLUS", "CiRCLE", "CiRCLE PLUS", "MAGiCAL"].map(
          (version, i) => ({ ...base, id: `s${i}`, version }),
        ),
      },
    ],
  };
  assert.deepEqual(
    normalizeCatalog(input, "CiRCLE PLUS").charts.map((c) => c.bucket),
    ["old", "new", "new", "new"],
  );
});
test("plan projections equal a full sequential B50 recalculation, including replacements", () => {
  const scores = makeDemo(catalog);
  const settings = { ...DEFAULT_SETTINGS, credits: 6 };
  const plan = createPlan(catalog.charts, scores, settings);
  assert.equal(plan.slots.length, 18);
  assert.equal(new Set(plan.slots.map((s) => s.chart.id)).size, 18);
  let hypothetical = [...scores];
  for (const slot of plan.slots) {
    assert.ok(
      slot.chart.constant >= settings.minLevel &&
        slot.chart.constant <= settings.maxLevel,
    );
    const before = best50(catalog.charts, hypothetical).total;
    const prior = hypothetical.find((s) => s.chartId === slot.chart.id);
    hypothetical = [
      ...hypothetical.filter((s) => s.chartId !== slot.chart.id),
      {
        chartId: slot.chart.id,
        achievement: Math.max(slot.target, prior?.achievement ?? 0),
        combo: prior?.combo ?? "none",
      },
    ];
    assert.equal(
      slot.gain,
      best50(catalog.charts, hypothetical).total - before,
    );
  }
  assert.equal(plan.totalAfter, best50(catalog.charts, hypothetical).total);
  assert.equal(
    plan.totalAfter - plan.totalBefore,
    plan.slots.reduce((sum, s) => sum + s.gain, 0),
  );
});
test("empty profiles and exhausted ranges stay honest", () => {
  const plan = createPlan(catalog.charts, [], DEFAULT_SETTINGS);
  assert.equal(plan.totalBefore, 0);
  assert.ok(plan.notices.some((n) => n.includes("Partial B50")));
  assert.ok(plan.slots.every((s) => s.current === null && s.target === 97));
  const noCharts = createPlan([], [], DEFAULT_SETTINGS);
  assert.equal(noCharts.slots.length, 0);
  assert.equal(noCharts.totalAfter, 0);
});
test("imports reject other regions, invalid scores and unknown charts atomically", () => {
  const c = catalog.charts[0];
  assert.throws(() => importScores({ region: "jp", scores: [] }, catalog));
  assert.throws(() =>
    importScores([{ chartId: c.id, achievement: 102 }], catalog),
  );
  assert.throws(() =>
    importScores(
      [
        { chartId: c.id, achievement: 99 },
        { chartId: "missing", achievement: 99 },
      ],
      catalog,
    ),
  );
  const result = importScores(
    [
      { chartId: c.id, achievement: 99 },
      { chartId: c.id, achievement: 100 },
    ],
    catalog,
  );
  assert.equal(result.length, 1);
  assert.equal(result[0].achievement, 100);
});
test("validation rejects oversized budgets, inverted ranges and excess score precision", () => {
  assert.equal(
    settingsSchema.safeParse({ ...DEFAULT_SETTINGS, credits: 100 }).success,
    false,
  );
  assert.equal(
    settingsSchema.safeParse({
      ...DEFAULT_SETTINGS,
      minLevel: 14,
      maxLevel: 12,
    }).success,
    false,
  );
  assert.equal(
    scoreSchema.safeParse({ chartId: "x", achievement: 99.12345 }).success,
    false,
  );
});
test("exercise retrieval follows selected focus and fallback never claims live AI", () => {
  const plan = createPlan(catalog.charts, makeDemo(catalog), {
    ...DEFAULT_SETTINGS,
    focus: "slides",
  });
  const sources = retrieveDrills(plan);
  assert.ok(sources.some((s) => s.id === "slides"));
  assert.ok(!sources.some((s) => s.id === "breaks"));
  const response = plannerAdvice(plan, "Diagnose my technique.");
  assert.equal(response.mode, "planner");
  assert.ok(response.advice.answer.includes("cannot answer free-form"));
});
