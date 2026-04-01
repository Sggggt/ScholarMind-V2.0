// ============================================================
// 自动化科研Agent系统 — 桌面端类型定义（与后端API对齐）
// ============================================================

/** 任务状态 */
export type TaskStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'review'
  | 'completed'
  | 'failed'
  | 'aborted';

/** 9大模块ID */
export type ModuleId =
  | 'M1'
  | 'M2'
  | 'M3'
  | 'M4'
  | 'M5'
  | 'M6'
  | 'M7'
  | 'M8'
  | 'M9';

/** 模块名称映射 */
export const MODULE_NAMES: Record<ModuleId, string> = {
  M1: '文献调研',
  M2: '选题开题',
  M3: 'Idea打分',
  M4: '代码生成',
  M5: '实验设计',
  M6: 'Agent实验',
  M7: '结果分析',
  M8: '论文写作',
  M9: '评审打分',
};

/** 模块状态 */
export type ModuleStatus =
  | 'waiting'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

/** 单个模块进度 */
export interface ModuleProgress {
  module_id: ModuleId;
  status: ModuleStatus;
  percent: number;
  step: string;
  message: string;
  started_at?: string;
  finished_at?: string;
}

/** 研究任务 */
export interface Task {
  id: string;
  title: string;
  topic: string;
  description?: string;
  status: TaskStatus;
  current_module?: ModuleId;
  modules: ModuleProgress[];
  created_at: string;
  updated_at: string;
  completed_at?: string;
  output_url?: string;
}

/** 创建任务请求 */
export interface CreateTaskRequest {
  topic: string;
  description?: string;
  config?: TaskConfig;
}

/** 任务配置 */
export interface TaskConfig {
  max_retries?: number;
  auto_review?: boolean;
  target_score?: number;
  llm_model?: string;
}

/** 日志条目 */
export interface LogEntry {
  id: string;
  task_id: string;
  module_id?: ModuleId;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** 评审维度 */
export interface ReviewDimension {
  name: string;
  score: number;
  max_score: number;
  comment: string;
}

/** 评审结果 */
export interface ReviewResult {
  task_id: string;
  overall_score: number;
  decision: 'accept' | 'weak_accept' | 'weak_reject' | 'reject';
  dimensions: ReviewDimension[];
  summary: string;
  created_at: string;
}

/** 产出物 */
export interface TaskOutput {
  paper_url?: string;
  code_url?: string;
  data_url?: string;
  figures?: string[];
}

// ============================================================
// WebSocket 消息类型
// ============================================================

export interface WsProgressMessage {
  type: 'progress';
  task_id: string;
  module: ModuleId;
  step: string;
  percent: number;
  message: string;
}

export interface WsResultMessage {
  type: 'result';
  task_id: string;
  module: ModuleId;
  data: unknown;
}

export interface WsNeedReviewMessage {
  type: 'need_review';
  task_id: string;
  module: ModuleId;
  content: unknown;
}

export interface WsErrorMessage {
  type: 'error';
  task_id: string;
  module: ModuleId;
  error: string;
}

export interface WsCompletedMessage {
  type: 'completed';
  task_id: string;
  output_url: string;
}

export type WsMessage =
  | WsProgressMessage
  | WsResultMessage
  | WsNeedReviewMessage
  | WsErrorMessage
  | WsCompletedMessage;

// ============================================================
// 人工审阅反馈
// ============================================================

export interface ReviewFeedback {
  action: 'approve' | 'reject' | 'revise';
  comment?: string;
}
