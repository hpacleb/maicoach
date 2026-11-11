import { z } from "zod";
export const scoreSchema = z.object({
  chartId: z.string().max(40),
  achievement: z
    .number()
    .min(0)
    .max(101)
    .refine(
      (n) => Math.abs(n * 10000 - Math.round(n * 10000)) < 0.000001,
      "Use at most four decimal places",
    ),
  combo: z.enum(["none", "fc", "fcp", "ap", "app"]).default("none"),
});
export const scoresSchema = z.array(scoreSchema).max(10000);
export const settingsSchema = z
  .object({
    credits: z.number().int().min(1).max(12),
    goal: z.enum(["rating", "consistency", "discovery"]),
    focus: z.enum(["balanced", "slides", "breaks", "timing"]),
    minLevel: z.number().min(1).max(15),
    maxLevel: z.number().min(1).max(15),
  })
  .refine(
    (s) => s.minLevel <= s.maxLevel,
    "Minimum level must not exceed maximum",
  );
export const planInputSchema = z.object({
  scores: scoresSchema,
  settings: settingsSchema,
});
export const providerSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(1)
    .max(4096)
    .refine((v) => !/[\r\n]/.test(v)),
  baseUrl: z
    .string()
    .trim()
    .max(500)
    .transform((v) =>
      v.replace(/\/chat\/completions\/?$/, "").replace(/\/+$/, ""),
    )
    .refine((v) => {
      try {
        const url = new URL(v);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          (url.port === "" || url.port === "443") &&
          !url.hostname.endsWith(".")
        );
      } catch {
        return false;
      }
    }, "Use a public HTTPS API base URL on port 443, without credentials or query parameters."),
  model: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .refine((v) => !/[\r\n]/.test(v)),
  outputMode: z.enum(["chat", "jsonSchema"]).default("chat"),
});
export const coachInputSchema = planInputSchema.extend({
  provider: providerSchema.optional(),
  question: z
    .string()
    .trim()
    .max(600)
    .default("Explain how to approach this session."),
});
