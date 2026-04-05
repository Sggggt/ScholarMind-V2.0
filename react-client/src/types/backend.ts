export type BackendTaskStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'review'
  | 'completed'
  | 'failed'
  | 'aborted';

export type BackendModuleStatus = 'waiting' | 'running' | 'completed' | 'failed' | 'skipped';

export interface BackendModuleProgress {
  module_id: string;
  status: BackendModuleStatus | string;
  percent: number;
  step: string;
  message: string;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface BackendTaskResponse {
  id: string;
  title: string;
  topic: string;
  description: string;
  status: BackendTaskStatus;
  current_module?: string | null;
  modules: BackendModuleProgress[];
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  output_url?: string | null;
}

export interface BackendTaskCreateRequest {
  topic: string;
  description?: string;
  config?: Record<string, unknown>;
}

export interface BackendSelectIdeaRequest {
  idea_index: number;
  replace_existing?: boolean; // 是否在现有代码基础上修改
}

export interface BackendSelectIdeaResponse {
  ok: boolean;
  selected_idea: Record<string, unknown>;
  task: BackendTaskResponse;
}

export interface BackendChatSessionResponse {
  id: string;
  title: string;
  summary: string;
  task_id?: string | null;
  task_status?: BackendTaskStatus | string | null;
  created_at: string;
  updated_at: string;
  last_message_preview: string;
}

export interface BackendChatMessageResponse {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  kind: string;
  content: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface BackendChatSessionDetailResponse {
  session: BackendChatSessionResponse;
  messages: BackendChatMessageResponse[];
  task?: BackendTaskResponse | null;
}

export interface BackendChatMessageCreateRequest {
  content: string;
  task_description?: string;
  task_config?: Record<string, unknown>;
}

export interface BackendChatMessageSendResponse {
  session: BackendChatSessionResponse;
  user_message: BackendChatMessageResponse;
  assistant_message: BackendChatMessageResponse;
  task?: BackendTaskResponse | null;
  task_created: boolean;
}

export interface BackendRuntimeSettingsRequest {
  llm_provider: string;
  api_key: string;
  model: string;
  provider_base_url: string;
  search_provider: string;
  search_api_key: string;
  local_engine: string;
  local_server_url: string;
  local_model_path: string;
  local_model_alias: string;
  local_context_size: number;
  local_gpu_layers: number;
  public_base_url: string;
}

export interface BackendRuntimeSettingsResponse extends BackendRuntimeSettingsRequest {
  env_path: string;
}

export interface BackendConnectionAddress {
  scope: 'lan' | 'public' | string;
  label: string;
  url: string;
  ws_url: string;
  source: string;
  recommended: boolean;
}

export interface BackendConnectionInfoResponse {
  host: string;
  port: number;
  api_base_path: string;
  ws_base_path: string;
  health_path: string;
  public_base_url: string;
  lan_urls: BackendConnectionAddress[];
  public_urls: BackendConnectionAddress[];
  recommended_mobile_url: string;
  recommended_mobile_ws_url: string;
  mobile_connection_count: number;
  notes: string[];
}

export interface BackendLogEntryResponse {
  id: string;
  task_id: string;
  module_id?: string | null;
  level: string;
  message: string;
  timestamp: string;
  metadata?: Record<string, unknown> | null;
}

export interface BackendTaskOutputResponse {
  paper_url?: string | null;
  code_url?: string | null;
  data_url?: string | null;
  figures: string[];
}

export interface BackendArtifactEntry {
  path: string;
  name: string;
  module: string;
  content_type: string;
  size: number;
  url?: string | null;
}

export interface BackendArtifactContentResponse {
  path: string;
  content_type: string;
  content: unknown;
}

export interface BackendRepoTreeNode {
  name: string;
  path: string;
  kind: 'folder' | 'file';
  children?: BackendRepoTreeNode[];
}

export interface BackendRepoFileResponse {
  path: string;
  content: string;
  language: string;
}

export interface BackendReviewDimension {
  name: string;
  score: number;
  max_score: number;
  comment: string;
}

export interface BackendReviewResultResponse {
  task_id: string;
  overall_score: number;
  decision: string;
  dimensions: BackendReviewDimension[];
  summary: string;
  created_at: string;
}

export interface BackendReviewReportResponse {
  individual_reviews?: Array<Record<string, unknown>>;
  meta_review?: Record<string, unknown> | null;
  credibility?: Record<string, unknown> | null;
  final_score?: number;
  decision?: string;
  literature_grounding_score?: number;
  missing_references?: string[];
}

export interface BackendSshStatusResponse {
  enabled: boolean;
  host?: string | null;
  user?: string | null;
  work_dir?: string | null;
}

export interface BackendSshTestResponse {
  ok: boolean;
  gpu?: string | Record<string, unknown> | null;
}

export interface BackendWsMessage {
  type: 'progress' | 'result' | 'need_review' | 'error' | 'completed';
  task_id: string;
  module?: string;
  step?: string;
  percent?: number;
  message: string;
  timestamp?: string;
  data?: Record<string, unknown> | null;
}
