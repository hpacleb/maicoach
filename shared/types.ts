export type Difficulty =
  "basic" | "advanced" | "expert" | "master" | "remaster";
export interface Chart {
  id: string;
  songId: string;
  title: string;
  artist: string;
  category: string;
  type: "dx" | "std";
  difficulty: Difficulty;
  level: string;
  constant: number;
  version: string;
  bucket: "new" | "old";
  bpm?: number;
  notes: {
    tap?: number;
    hold?: number;
    slide?: number;
    touch?: number;
    break?: number;
    total?: number;
  };
  url: string;
}
export interface Catalog {
  region: "intl";
  currentVersion: string;
  updatedAt: string;
  fetchedAt: string;
  source: string;
  sourceCommit: string;
  sha256: string;
  charts: Chart[];
  songCount: number;
}
export interface Score {
  chartId: string;
  achievement: number;
  combo: "none" | "fc" | "fcp" | "ap" | "app";
}
export interface Settings {
  credits: number;
  goal: "rating" | "consistency" | "discovery";
  focus: "balanced" | "slides" | "breaks" | "timing";
  minLevel: number;
  maxLevel: number;
}
export interface PlanSlot {
  chart: Chart;
  phase: "warmup" | "push" | "explore";
  target: number;
  current: number | null;
  gain: number;
  reason: string;
  drillId: string;
}
export interface PracticePlan {
  slots: PlanSlot[];
  totalBefore: number;
  totalAfter: number;
  recordedCount: number;
  settings: Settings;
  notices: string[];
}
export interface Advice {
  summary: string;
  tips: string[];
  answer: string;
}
export interface CoachResponse {
  mode: "ai" | "planner";
  advice: Advice;
  sources: { id: string; title: string; text: string }[];
  notice?: string;
}
export const DEFAULT_SETTINGS: Settings = {
  credits: 3,
  goal: "rating",
  focus: "balanced",
  minLevel: 12,
  maxLevel: 13.9,
};
