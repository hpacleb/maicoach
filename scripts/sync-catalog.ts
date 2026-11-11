import { mkdir, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { normalizeCatalog } from "../shared/normalize";
import type { Catalog } from "../shared/types";
const source = "https://miruku.dxrating.net/api/v1/dxdata";
const version = process.env.DXRATING_INTL_VERSION || "CiRCLE PLUS";
const response = await fetch(source, {
  headers: {
    "User-Agent": "MaiCoach/1.0 (+https://github.com/hpacleb/maicoach)",
  },
  signal: AbortSignal.timeout(30000),
});
if (!response.ok) throw new Error(`DXRating returned ${response.status}`);
const raw = await response.text();
const normalized = normalizeCatalog(JSON.parse(raw), version);
if (normalized.charts.length < 1000)
  throw new Error("Unexpectedly small catalog; keeping the previous snapshot.");
const catalog: Catalog = {
  ...normalized,
  region: "intl",
  currentVersion: version,
  source,
  // Version selection verified against DXRating's region-versions.ts at this revision.
  sourceCommit: "8d82f8d997a5d31664c4cd0f0c9a7d86c809ebfc",
  fetchedAt: new Date().toISOString(),
  sha256: createHash("sha256").update(raw).digest("hex"),
};
await mkdir("data", { recursive: true });
await writeFile("data/catalog.json.tmp", JSON.stringify(catalog));
await rename("data/catalog.json.tmp", "data/catalog.json");
console.log(
  `Saved ${catalog.charts.length} international charts / ${catalog.songCount} songs for ${version}.`,
);
