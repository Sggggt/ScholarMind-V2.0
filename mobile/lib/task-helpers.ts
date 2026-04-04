import type {
  ArtifactContent,
  LogEntry,
  ModuleId,
  ModuleState,
  Task,
  TaskIdea,
} from "./types";
import { MODULE_SEQUENCE } from "./types";

const MODULE_INDEX = MODULE_SEQUENCE.reduce<Record<ModuleId, number>>((acc, moduleId, index) => {
  acc[moduleId] = index;
  return acc;
}, {} as Record<ModuleId, number>);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readNumber(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

export function getModuleIndex(moduleId?: string | null): number {
  if (!moduleId) return -1;
  return MODULE_INDEX[moduleId as ModuleId] ?? -1;
}

export function getCurrentModuleState(task: Task | null): ModuleState | null {
  if (!task?.current_module) return null;
  return task.modules.find((module) => module.module_id === task.current_module) ?? null;
}

export function getTaskProgressPercent(task: Task | null): number {
  if (!task) return 0;
  if (task.status === "completed") return 100;

  const currentIndex = getModuleIndex(task.current_module);
  const currentModule = getCurrentModuleState(task);
  if (currentIndex < 0) {
    const completedModules = task.modules.filter((module) => module.status === "completed").length;
    return Math.round((completedModules / Math.max(task.modules.length, 1)) * 100);
  }

  const completedShare = currentIndex / Math.max(task.modules.length, 1);
  const runningShare = (currentModule?.percent ?? 0) / 100 / Math.max(task.modules.length, 1);
  return Math.max(0, Math.min(100, Math.round((completedShare + runningShare) * 100)));
}

export function summarizeMarkdown(content: string, maxLength = 240): string {
  const plain = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`>-]/g, " ")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, maxLength).trim()}…`;
}

export function getArtifactText(
  artifactContents: Record<string, ArtifactContent>,
  path: string
): string {
  const content = artifactContents[path]?.content;
  return typeof content === "string" ? content : "";
}

export function getM1Summary(artifactContents: Record<string, ArtifactContent>) {
  const reviewText = getArtifactText(artifactContents, "m1_literature_review.md");
  const sourcesRaw = artifactContents["m1_sources.json"]?.content;
  const sourceCount = Array.isArray(sourcesRaw)
    ? sourcesRaw.length
    : asArray((asRecord(sourcesRaw).sources ?? sourcesRaw)).length;

  return {
    summary: reviewText ? summarizeMarkdown(reviewText, 260) : "",
    sourceCount,
  };
}

export function getM2Highlights(artifactContents: Record<string, ArtifactContent>) {
  const gapContent = artifactContents["m2_gap_analysis.json"]?.content;
  const gaps = asArray<Record<string, unknown>>(asRecord(gapContent).gaps);

  return {
    gapCount: gaps.length,
    highlights: gaps
      .slice(0, 3)
      .map((gap) => readString(gap.description, gap.title))
      .filter(Boolean),
  };
}

export function normalizeIdea(
  rawIdea: Record<string, unknown>,
  index: number,
  recommended: boolean
): TaskIdea {
  const scores = asRecord(rawIdea.scores);
  const rawId = readString(rawIdea.Name, rawIdea.name, rawIdea.title, rawIdea.Title) || `idea-${index + 1}`;
  const title = readString(rawIdea.title, rawIdea.Title, rawIdea.Name) || `候选 Idea ${index + 1}`;
  const premise =
    readString(
      rawIdea.method,
      rawIdea.problem,
      rawIdea.experiment_plan,
      rawIdea.key_innovation,
      rawIdea.Experiment
    ) || "当前想法还没有完整的方法摘要。";

  const hypothesis =
    readString(rawIdea.hypothesis, rawIdea.premise, rawIdea.problem, rawIdea.method) || premise;
  const innovation = readNumber(scores.novelty, rawIdea.Novelty, 5);
  const feasibility = readNumber(scores.feasibility, rawIdea.Feasibility, 5);
  const evidenceStrength = readNumber(scores.interestingness, rawIdea.Interestingness, 5);
  const compositeScore = readNumber(rawIdea.composite_score, innovation * feasibility * evidenceStrength);
  const overallScore = readNumber(rawIdea.overall_score, (innovation + feasibility + evidenceStrength) / 3);
  const id =
    rawId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `idea-${index + 1}`;

  return {
    id,
    title,
    premise,
    hypothesis,
    innovation,
    feasibility,
    evidenceStrength,
    risk: Math.max(1, 10 - feasibility),
    overallScore,
    compositeScore,
    recommended,
    raw: rawIdea,
  };
}

export function getM3Summary(ideas: TaskIdea[]) {
  const bestIdea = ideas.find((idea) => idea.recommended) ?? ideas[0] ?? null;
  return {
    ideaCount: ideas.length,
    bestIdeaTitle: bestIdea?.title ?? "",
    bestIdeaScore: bestIdea?.overallScore ?? 0,
  };
}

export function shouldLoadM1Artifacts(task: Task): boolean {
  return getModuleIndex(task.current_module) >= 0;
}

export function shouldLoadM2Artifacts(task: Task): boolean {
  return getModuleIndex(task.current_module) >= 1;
}

export function shouldLoadIdeas(task: Task): boolean {
  return getModuleIndex(task.current_module) >= 2 || task.status === "paused";
}

export function toWsLogEntry(message: {
  task_id: string;
  module?: string;
  message: string;
  timestamp?: string;
  type: string;
  step?: string;
}): LogEntry {
  return {
    id: `ws-${message.task_id}-${message.timestamp ?? Date.now()}-${message.type}-${message.step ?? "step"}`,
    task_id: message.task_id,
    module_id: (message.module as ModuleId | undefined) ?? undefined,
    level: message.type === "error" ? "error" : "info",
    message: message.message,
    timestamp: message.timestamp ?? new Date().toISOString(),
    metadata: message.step ? { step: message.step, source: "websocket" } : { source: "websocket" },
  };
}
