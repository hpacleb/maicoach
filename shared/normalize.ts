import { z } from "zod";
import type { Catalog, Chart, Difficulty } from "./types";
const override = z.object({
  level: z.string().optional(),
  levelValue: z.number().optional(),
  version: z.string().optional(),
});
const sheet = z.object({
  id: z.string(),
  type: z.string(),
  difficulty: z.string(),
  level: z.string(),
  internalLevelValue: z.number(),
  serverIds: z.array(z.string()),
  isSpecial: z.boolean(),
  version: z.string(),
  serverOverrides: z.record(z.string(), override).optional(),
  multiverInternalLevelValue: z.record(z.string(), z.number()).optional(),
  noteCounts: z.object({
    tap: z.number().optional(),
    hold: z.number().optional(),
    slide: z.number().optional(),
    touch: z.number().optional(),
    break: z.number().optional(),
    total: z.number().optional(),
  }),
});
const document = z.object({
  schemaVersion: z.literal(1),
  updatedAt: z.iso.datetime({ offset: true }),
  versions: z.array(z.object({ version: z.string() })),
  songs: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      artist: z.string(),
      category: z.string(),
      bpm: z.number().optional(),
      sheets: z.array(sheet),
    }),
  ),
});
export function normalizeCatalog(
  input: unknown,
  currentVersion: string,
): Pick<Catalog, "charts" | "songCount" | "updatedAt"> {
  const data = document.parse(input);
  const versionIndex = data.versions.findIndex(
    (v) => v.version === currentVersion,
  );
  if (versionIndex < 0)
    throw new Error("International version is absent from the source catalog.");
  // From CiRCLE onward upstream's B15 includes the selected release and its immediate predecessor.
  const circleIndex = data.versions.findIndex((v) => v.version === "CiRCLE");
  const newPoolStart =
    circleIndex >= 0 && versionIndex >= circleIndex
      ? versionIndex - 1
      : versionIndex;
  const difficulties = new Set([
    "basic",
    "advanced",
    "expert",
    "master",
    "remaster",
  ]);
  const charts: Chart[] = [];
  for (const song of data.songs)
    for (const item of song.sheets) {
      if (
        !item.serverIds.includes("intl") ||
        item.isSpecial ||
        !["dx", "std"].includes(item.type) ||
        !difficulties.has(item.difficulty)
      )
        continue;
      const intl = item.serverOverrides?.intl;
      const constant =
        intl?.levelValue ??
        item.multiverInternalLevelValue?.[currentVersion] ??
        item.internalLevelValue;
      if (!Number.isFinite(constant) || constant <= 0 || constant > 15)
        continue;
      const version = intl?.version ?? item.version;
      const index = data.versions.findIndex((v) => v.version === version);
      if (index < 0) throw new Error(`Unknown chart version: ${version}`);
      charts.push({
        id: item.id,
        songId: song.id,
        title: song.title,
        artist: song.artist,
        category: song.category,
        type: item.type as Chart["type"],
        difficulty: item.difficulty as Difficulty,
        // Version-specific constants may change a displayed level, too.
        level:
          intl?.level ??
          (constant < 7
            ? String(Math.floor(constant))
            : `${Math.floor(constant)}${Math.round(constant * 10) % 10 >= 6 ? "+" : ""}`),
        constant,
        version,
        bucket: index >= newPoolStart ? "new" : "old",
        bpm: song.bpm,
        notes: item.noteCounts,
        url: `https://dxrating.net/songs/${song.id}/${item.type}/${item.difficulty}`,
      });
    }
  if (new Set(charts.map((c) => c.id)).size !== charts.length)
    throw new Error("Duplicate chart IDs.");
  return {
    charts,
    songCount: new Set(charts.map((c) => c.songId)).size,
    updatedAt: data.updatedAt,
  };
}
