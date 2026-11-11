import test from "node:test";
import assert from "node:assert/strict";
import { createApp, loadCatalog } from "../server/app";
import { DEFAULT_SETTINGS } from "../shared/types";
import type { AddressInfo } from "node:net";
test("API contract: health, catalog, valid plan, malformed requests and truthful coach mode", async () => {
  const prior = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const server = createApp(loadCatalog(), false).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown) =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    const health = await fetch(base + "/api/health");
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    const status = await health.json();
    assert.equal(status.region, "intl");
    assert.equal(status.aiMode, "byok");
    const library = await (await fetch(base + "/api/catalog")).json();
    assert.ok(library.charts.length > 6000);
    const valid = await post("/api/plan", {
      scores: [],
      settings: DEFAULT_SETTINGS,
    });
    assert.equal(valid.status, 200);
    const plan = await valid.json();
    assert.equal(plan.slots.length, 9);
    assert.equal(plan.totalBefore, 0);
    assert.equal(
      (
        await post("/api/plan", {
          scores: [],
          settings: { ...DEFAULT_SETTINGS, credits: 1000 },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post("/api/plan", {
          scores: [{ chartId: "missing", achievement: 99 }],
          settings: DEFAULT_SETTINGS,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await fetch(base + "/api/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        })
      ).status,
      400,
    );
    assert.equal((await fetch(base + "/api/missing")).status, 404);
    const coach = await (
      await post("/api/coach", {
        scores: [],
        settings: DEFAULT_SETTINGS,
        question: "Explain my plan.",
      })
    ).json();
    assert.equal(coach.mode, "planner");
    assert.ok(coach.sources.length > 0);
    assert.equal(coach.advice.summary.includes("AI-generated"), false);
  } finally {
    if (prior) process.env.OPENAI_API_KEY = prior;
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});
