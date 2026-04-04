export type WorkflowStatus = 'not-started' | 'in-progress' | 'completed' | 'risk';
export type RunStatus = 'idle' | 'running' | 'paused' | 'review' | 'completed' | 'failed' | 'aborted';
export type TaskCommand = 'pause' | 'resume' | 'abort' | 'restart';
export type TransitionState = 'creating' | 'stage-change' | 'completed' | 'restarting' | 'aborting';

export type StageId =
  | 'literature'
  | 'gaps'
  | 'ideas'
  | 'repository'
  | 'experiment'
  | 'agent-run'
  | 'results'
  | 'writing'
  | 'validation';

export type PageId =
  | 'login'
  | 'workspace'
  | 'workflow'
  | 'history'
  | 'settings'
  | StageId;

export interface RouteMeta {
  id: PageId;
  title: string;
  path: string;
  section: 'workspace' | 'workflow' | 'utility';
  group: 'research' | 'evidence' | 'writing' | 'governance';
  icon: string;
  description: string;
}

export interface WorkflowStage {
  id: StageId;
  title: string;
  path: string;
  status: WorkflowStatus;
  summary: string;
}

export interface RecentSession {
  id: string;
  title: string;
  domain: string;
  updatedAt: string;
  stageLabel: string;
  taskId?: string;
  taskStatus?: string;
}

export interface UserProfile {
  name: string;
  role: string;
  affiliation: string;
}

export interface ChatQuickAction {
  label: string;
  path?: string;
  stageId?: StageId;
  command?: TaskCommand;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  kind?: 'text' | 'thinking' | 'stage-transition' | 'running-status';
  quickActions?: ChatQuickAction[];
}

export interface ExplorationState {
  topic: string;
  summary: string;
  keywords: string[];
  directions: string[];
  authors: string[];
  institutions: string[];
  insight: string;
}

export interface LiteratureFilters {
  topic: string;
  keywords: string;
  yearStart: number;
  yearEnd: number;
}

export interface PaperRecord {
  id: string;
  title: string;
  source: string;
  url?: string;
  year: number;
  authors: string;
  focus: string;
  status: 'queued' | 'selected' | 'extracted';
  citations: number;
  abstract: string;
}

export interface ExtractionSection {
  id: string;
  label: string;
  summary: string;
  quotes: string[];
}

export interface RelationNode {
  source: string;
  relation: string;
  target: string;
}

export interface TrendEvent {
  year: string;
  title: string;
  summary: string;
}

export interface RankedPaper {
  id: string;
  title: string;
  signal: string;
  rationale: string;
}

export interface ResearchGap {
  id: string;
  title: string;
  whyItMatters: string;
  risk: string;
  tags: string[];
  score: number;
  recommendation: string;
}

export interface IdeaCandidate {
  id: string;
  title: string;
  premise: string;
  innovation: number;
  feasibility: number;
  evidenceStrength: number;
  risk: number;
  recommended: boolean;
}

export interface RepositoryFile {
  id: string;
  label: string;
  kind: 'folder' | 'file';
  language?: string;
  preview: string;
}

export interface ExperimentDesignState {
  dataset: string;
  model: string;
  baseline: string;
  metrics: string[];
  runtime: string;
  hypothesis: string;
}

export interface RunStep {
  id: string;
  label: string;
  status: WorkflowStatus;
}

export interface RunLog {
  id: string;
  level: 'info' | 'warning' | 'risk';
  timestamp: string;
  message: string;
}

export interface ExperimentResult {
  id: string;
  label: string;
  description?: string;
  metrics: Record<string, string>;
  interpretation: string;
  errorCases: string[];
  isSimulated?: boolean;
}

export interface WritingSection {
  id: string;
  label: string;
  outline: string;
  content: string;
  evidence: string[];
}

export interface ValidationClaim {
  id: string;
  claim: string;
  evidence: string[];
  reviewerNote: string;
  risk: string;
}
