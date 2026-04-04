export type ModuleId = "M1" | "M2" | "M3" | "M4" | "M5" | "M6" | "M7" | "M8" | "M9";

export type ModuleStatus =
  | "waiting"
  | "running"
  | "completed"
  | "failed"
  | "paused"
  | "review"
  | "aborted";

export type TaskStatus =
  | "pending"
  | "running"
  | "paused"
  | "review"
  | "completed"
  | "failed"
  | "aborted";

export type LogLevel = "info" | "warn" | "error" | string;
export type IdeaListStatus = "ready" | "generating" | "not_started";
export type NetworkMode = "lan" | "public" | "unknown";

export interface ModuleState {
  module_id: ModuleId;
  status: ModuleStatus | string;
  percent: number;
  step: string;
  message: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface Task {
  id: string;
  title: string;
  topic: string;
  description: string;
  status: TaskStatus;
  current_module?: ModuleId | null;
  modules: ModuleState[];
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  output_url?: string | null;
}

export interface LogEntry {
  id: string;
  task_id: string;
  module_id?: ModuleId | null;
  level: LogLevel;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown> | null;
}

export interface ArtifactContent {
  path: string;
  content_type: string;
  content: unknown;
}

export interface TaskIdea {
  id: string;
  title: string;
  premise: string;
  hypothesis: string;
  innovation: number;
  feasibility: number;
  evidenceStrength: number;
  risk: number;
  overallScore: number;
  compositeScore: number;
  recommended: boolean;
  raw: Record<string, unknown>;
}

export interface TaskIdeasState {
  ideas: TaskIdea[];
  status: IdeaListStatus;
  totalGenerated: number;
  bestIdeaIndex: number;
  message: string;
}

export interface WsMessage {
  type: "progress" | "result" | "need_review" | "error" | "completed";
  task_id: string;
  module?: ModuleId | string;
  step?: string;
  percent?: number;
  message: string;
  timestamp?: string;
  data?: Record<string, unknown> | null;
}

export interface ConnectionTestResult {
  normalizedUrl: string;
  rest: boolean;
  websocket: boolean;
  resolvedWsUrl: string;
  networkMode: NetworkMode;
}

export const MODULE_SEQUENCE: ModuleId[] = [
  "M1",
  "M2",
  "M3",
  "M4",
  "M5",
  "M6",
  "M7",
  "M8",
  "M9",
];

export const MODULE_NAMES: Record<ModuleId, string> = {
  M1: "文献调研",
  M2: "研究空白",
  M3: "Idea 生成",
  M4: "代码生成",
  M5: "实验设计",
  M6: "Agent 实验",
  M7: "结果分析",
  M8: "论文写作",
  M9: "评审打分",
};

export const MODULE_DESCRIPTIONS: Record<ModuleId, string> = {
  M1: "汇总当前主题的文献综述与证据来源。",
  M2: "提炼尚未被充分回答的问题与研究缺口。",
  M3: "生成候选研究 Idea，并等待人工决策。",
  M4: "基于选定 Idea 继续推进代码与实验。",
  M5: "规划实验方案和评测设置。",
  M6: "执行自动化实验与代理协作。",
  M7: "分析结果、失败案例与结论。",
  M8: "生成论文草稿与写作产物。",
  M9: "输出评审与整体质量评分。",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "等待中",
  running: "运行中",
  paused: "已暂停",
  review: "待审阅",
  completed: "已完成",
  failed: "失败",
  aborted: "已终止",
};

export const DEFAULT_IDEAS_STATE: TaskIdeasState = {
  ideas: [],
  status: "not_started",
  totalGenerated: 0,
  bestIdeaIndex: 0,
  message: "",
};
