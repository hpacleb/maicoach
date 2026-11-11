import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import path from "node:path";
import { readFileSync } from "node:fs";
import { createPlan } from "../shared/planner";
import { planInputSchema, coachInputSchema } from "../shared/validation";
import type { Catalog } from "../shared/types";
import { aiAdvice, plannerAdvice } from "./coach";

export function createApp(catalog: Catalog, serveClient = true) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/health", (_req, res) =>
    res.json({
      status: "ok",
      region: "intl",
      version: catalog.currentVersion,
      charts: catalog.charts.length,
      aiConfigured: Boolean(process.env.OPENAI_API_KEY),
      catalogUpdatedAt: catalog.updatedAt,
    }),
  );
  app.get("/api/catalog", (_req, res) => {
    res.set("Cache-Control", "public, max-age=3600");
    res.json(catalog);
  });
  const limiter = rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many requests. Try again in a minute." },
  });
  const aiLimiter = rateLimit({
    windowMs: 3600000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error:
        "Coaching limit reached. You can keep using the planner; try AI again later.",
    },
  });
  const ids = new Set(catalog.charts.map((c) => c.id));
  function validIds(scores: { chartId: string }[]) {
    return scores.every((s) => ids.has(s.chartId));
  }
  app.post("/api/plan", limiter, (req, res) => {
    const parsed = planInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({
          error: "Invalid scores or session settings.",
          details: parsed.error.issues.map((i) => i.message),
        });
      return;
    }
    if (!validIds(parsed.data.scores)) {
      res
        .status(400)
        .json({
          error:
            "Some chart IDs are not in the international catalog. Refresh the catalog or fix your import.",
        });
      return;
    }
    res.json(
      createPlan(catalog.charts, parsed.data.scores, parsed.data.settings),
    );
  });
  let active = 0;
  let dailyCalls = 0;
  let day = "";
  app.post("/api/coach", aiLimiter, async (req, res) => {
    const parsed = coachInputSchema.safeParse(req.body);
    if (
      !parsed.success ||
      !validIds(parsed.success ? parsed.data.scores : [])
    ) {
      res.status(400).json({ error: "Invalid coaching request." });
      return;
    }
    const plan = createPlan(
      catalog.charts,
      parsed.data.scores,
      parsed.data.settings,
    );
    if (!process.env.OPENAI_API_KEY) {
      res.json(plannerAdvice(plan, parsed.data.question));
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (day !== today) {
      day = today;
      dailyCalls = 0;
    }
    const maxDaily = Number(process.env.AI_MAX_DAILY || 100);
    if (active >= 2 || dailyCalls >= maxDaily) {
      res
        .status(429)
        .json({
          error:
            "AI coaching is at capacity. The practice planner is still available.",
        });
      return;
    }
    active++;
    dailyCalls++;
    try {
      res.json(await aiAdvice(plan, parsed.data.question));
    } catch {
      // Never log upstream request objects: they may contain provider credentials and player data.
      res.json({
        ...plannerAdvice(plan, parsed.data.question),
        notice:
          "The AI provider is unavailable. Showing exercise-library guidance instead.",
      });
    } finally {
      active--;
    }
  });
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Endpoint not found." });
  });
  if (serveClient) {
    const clientPath = path.resolve("dist/client");
    app.use(express.static(clientPath, { maxAge: "1h", index: false }));
    app.get("/{*path}", (_req, res) => {
      res.set("Cache-Control", "no-cache");
      res.sendFile(path.join(clientPath, "index.html"));
    });
  }
  app.use(
    (
      err: { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status = err.status === 413 ? 413 : err.status === 400 ? 400 : 500;
      res
        .status(status)
        .json({
          error:
            status === 413
              ? "Import is too large."
              : status === 400
                ? "Request must contain valid JSON."
                : "Something went wrong. Please try again.",
        });
    },
  );
  return app;
}
export function loadCatalog(): Catalog {
  return JSON.parse(readFileSync(path.resolve("data/catalog.json"), "utf8"));
}
