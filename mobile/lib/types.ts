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

export interface RepoTreeNode {
  name: string;
  path: string;
  kind: "folder" | "file";
  children?: RepoTreeNode[];
}

export interface TaskOutput {
  paper_url?: string | null;
  code_url?: string | null;
  data_url?: string | null;
  figures: string[];
}

export interface ReviewReport {
  individual_reviews?: Array<Record<string, unknown>>;
  meta_review?: Record<string, unknown> | null;
  credibility?: Record<string, unknown> | null;
  final_score?: number;
  decision?: string;
  literature_grounding_score?: number;
  missing_references?: string[];
}

export interface ChatSession {
  id: string;
  title: string;
  summary: string;
  task_id?: string | null;
  task_status?: string | null;
  created_at: string;
  updated_at: string;
  last_message_preview: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  kind: string;
  content: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface ChatSessionDetail {
  session: ChatSession;
  messages: ChatMessage[];
  task?: Task | null;
}

export interface ChatMessageSendResponse {
  session: ChatSession;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
  task?: Task | null;
  task_created: boolean;
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

export interface ConnectionAddress {
  scope: "lan" | "public" | string;
  label: string;
  url: string;
  ws_url: string;
  source: string;
  recommended: boolean;
}

export interface ConnectionInfo {
  host: string;
  port: number;
  api_base_path: string;
  ws_base_path: string;
  health_path: string;
  public_base_url: string;
  lan_urls: ConnectionAddress[];
  public_urls: ConnectionAddress[];
  recommended_mobile_url: string;
  recommended_mobile_ws_url: string;
  mobile_connection_count: number;
  notes: string[];
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
  M3: "想法生成",
  M4: "代码生成",
  M5: "实验设计",
  M6: "Agent 运行",
  M7: "结果分析",
  M8: "论文写作",
  M9: "评审验证",
};

export const MODULE_DESCRIPTIONS: Record<ModuleId, string> = {
  M1: "梳理相关工作并汇总证据基础。",
  M2: "提炼尚未充分回答的研究问题与空白。",
  M3: "生成候选研究想法并等待人工决策。",
  M4: "围绕选定想法继续推进代码与实现。",
  M5: "规划实验方案与评测设置。",
  M6: "跟踪自动化执行与 Agent 协作过程。",
  M7: "分析实验结果、失败案例与结论。",
  M8: "生成论文草稿与写作产物。",
  M9: "完成最终评审与整体质量检查。",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "待开始",
  running: "进行中",
  paused: "已暂停",
  review: "待评审",
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

export type DiscoveryStatus = "idle" | "scanning" | "stopped" | "error";

export interface DiscoveredDevice {
  name: string;
  host: string;
  addresses: string[];
  port: number;
  deviceId: string;
  fingerprint: string;
  fullName: string;
  url: string;
  displayName: string;
  apiPath?: string;
  wsPath?: string;
  healthPath?: string;
  role?: string;
  version?: string;
}

export interface SavedBackendSelection {
  url: string;
  source: "mdns" | "manual";
  deviceId?: string;
  displayName: string;
  host?: string;
  port?: number;
  lastSeenAt: string;
}

export interface DiscoveryState {
  status: DiscoveryStatus;
  devices: DiscoveredDevice[];
  error?: string;
}
