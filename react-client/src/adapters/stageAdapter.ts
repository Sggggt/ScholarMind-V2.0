import { initialStages } from '../data/routeData';
import type { BackendModuleProgress, BackendTaskResponse, BackendTaskStatus } from '../types/backend';
import type { RunStatus, RunStep, StageId, WorkflowStage, WorkflowStatus } from '../types/app';
import { sanitizeDisplayText } from '../utils/errorMessage';

const runModuleLabels: Record<string, string> = {
  M1: 'M1 文献研究',
  M2: 'M2 研究缺口',
  M3: 'M3 想法评分',
  M4: 'M4 代码生成',
  M5: 'M5 实验设计',
  M6: 'M6 Agent 执行',
  M7: 'M7 结果分析',
  M8: 'M8 论文写作',
  M9: 'M9 评审验证',
};

/**
 * Map tracer step identifiers to natural language summaries for the sidebar.
 * Only these descriptions appear in the sidebar; the log stream keeps raw output.
 */
const stepToSidebarLabel: Record<string, string> = {
  // M1
  configure: '正在配置文献调研参数',
  deep_research: '正在进行深度文献检索',
  write_report: '正在撰写文献综述报告',
  fallback_search: '正在使用本地检索生成综述',
  // M2
  build_index: '正在建立文献知识库',
  identify_gaps: '正在识别研究空白',
  generate_seeds: '正在生成种子研究方向',
  prepare_template: '正在准备项目模板',
  paperqa: '正在通过文献库获取依据',
  // M3
  generate_ideas: '正在生成研究想法',
  tree_search: '正在探索想法变体',
  novelty_check: '正在验证想法新颖性',
  resume: '正在恢复想法生成',
  // M4
  setup_project: '正在创建项目目录',
  setup_env: '正在准备运行环境',
  local_env: '正在准备运行环境',
  local_env_create: '正在创建虚拟环境',
  local_env_pip: '正在升级 pip',
  local_env_requirements: '正在安装依赖',
  run_baseline: '正在运行基线实验',
  init_git: '正在初始化代码仓库',
  implement_idea: '正在生成研究代码',
  copy_template: '正在加载代码模板',
  validate_code: '正在验证代码质量',
  requirements: '正在生成依赖清单',
  detect_existing: '正在检测已有代码',
  replace_mode: '正在替换研究方案',
  load_baseline: '正在加载基线结果',
  aider: '正在通过 Aider 修改代码',
  llm_gen: '正在通过 LLM 生成代码',
  llm_gen_fallback: '正在使用备用模板生成代码',
  fallback_gen: '正在使用降级方案生成代码',
  fallback_llm: '正在通过 LLM 生成代码',
  fallback_template: '正在使用模板生成代码',
  fallback_minimal: '正在生成最小可运行代码',
  fallback_llm_error: 'LLM 生成失败',
  // M5
  design_experiment: '正在设计实验方案',
  // M6
  run_experiment: '正在运行实验',
  ssh_setup: '正在配置远程环境',
  local_run: '正在本地运行实验',
  collect_results: '正在收集实验结果',
  // M7
  analyze_results: '正在分析实验结果',
  // M8
  write_paper: '正在撰写论文',
  // M9
  review_paper: '正在评审论文',
  // Generic
  start: '正在启动',
  done: '已完成',
  retry: '正在重试',
  max_retries: '已达最大重试次数',
  review: '等待人工审阅',
  paused: '已暂停',
  aborted: '已终止',
  cancelled: '已取消',
  pipeline_error: '流程执行出错',
  no_ideas: '未能生成想法',
  skip_optional: '正在跳过可选步骤',
};

const genericProgressSteps = new Set(['start', 'done', 'retry', 'max_retries', 'review', 'pipeline_error']);

function summarizeRunningStage(title: string, module: BackendModuleProgress) {
  const step = (module.step || '').trim();

  if (step && stepToSidebarLabel[step]) {
    return stepToSidebarLabel[step];
  }

  // Fallback: generic natural language per status
  return `${title}正在执行`;
}

function normalizeModuleStatus(status?: string): WorkflowStatus {
  switch (status) {
    case 'running':
      return 'in-progress';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'aborted':
      return 'risk';
    case 'waiting':
    case 'skipped':
    default:
      return 'not-started';
  }
}

function getModule(task: BackendTaskResponse, moduleId: string) {
  return task.modules.find((module) => module.module_id === moduleId);
}

function summarizeStage(title: string, task: BackendTaskResponse, module?: BackendModuleProgress) {
  if (!module) {
    return task.topic ? `${title}等待真实产物。` : '尚未创建任务。';
  }

  if (module.status === 'completed') {
    return `${title}已完成，可以进入页面继续查看。`;
  }

  if (module.status === 'running') {
    return summarizeRunningStage(title, module);
  }

  if (module.status === 'failed') {
    return sanitizeDisplayText(module.message, `${title}执行失败，请检查日志。`);
  }

  return sanitizeDisplayText(module.message, `${title}尚未开始。`);
}

export function buildIdleStages() {
  return initialStages.map((stage) => ({ ...stage, status: 'not-started' as WorkflowStatus }));
}

export function adaptTaskToStages(task: BackendTaskResponse): WorkflowStage[] {
  const m1 = getModule(task, 'M1');
  const m2 = getModule(task, 'M2');
  const m3 = getModule(task, 'M3');
  const m4 = getModule(task, 'M4');
  const m5 = getModule(task, 'M5');
  const m6 = getModule(task, 'M6');
  const m7 = getModule(task, 'M7');
  const m8 = getModule(task, 'M8');
  const m9 = getModule(task, 'M9');

  const stageStatusMap: Record<StageId, WorkflowStatus> = {
    literature: normalizeModuleStatus(m1?.status),
    gaps: normalizeModuleStatus(m2?.status),
    ideas: normalizeModuleStatus(m3?.status),
    repository: normalizeModuleStatus(m4?.status),
    experiment: normalizeModuleStatus(m5?.status),
    'agent-run': normalizeModuleStatus(m6?.status),
    results: normalizeModuleStatus(m7?.status),
    writing: normalizeModuleStatus(m8?.status),
    validation: normalizeModuleStatus(m9?.status),
  };

  const stageModuleMap: Record<StageId, BackendModuleProgress | undefined> = {
    literature: m1,
    gaps: m2,
    ideas: m3,
    repository: m4,
    experiment: m5,
    'agent-run': m6,
    results: m7,
    writing: m8,
    validation: m9,
  };

  return initialStages.map((stage) => ({
    ...stage,
    status: stageStatusMap[stage.id],
    summary: summarizeStage(stage.title, task, stageModuleMap[stage.id]),
  }));
}

export function inferCurrentStage(task: BackendTaskResponse): StageId {
  switch (task.current_module) {
    case 'M2':
      return 'gaps';
    case 'M3':
      return 'ideas';
    case 'M4':
      return 'repository';
    case 'M5':
      return 'experiment';
    case 'M6':
      return 'agent-run';
    case 'M7':
      return 'results';
    case 'M8':
      return 'writing';
    case 'M9':
      return 'validation';
    case 'M1':
    default:
      return 'literature';
  }
}

export function buildIdleRunSteps(): RunStep[] {
  return Object.entries(runModuleLabels).map(([moduleId, label]) => ({
    id: moduleId,
    label,
    status: 'not-started',
  }));
}

export function adaptTaskToRunSteps(task: BackendTaskResponse): RunStep[] {
  const existing = new Map(task.modules.map((module) => [module.module_id, module]));

  return Object.entries(runModuleLabels).map(([moduleId, label]) => ({
    id: moduleId,
    label,
    status: normalizeModuleStatus(existing.get(moduleId)?.status),
  }));
}

export function adaptTaskToRunProgress(task: BackendTaskResponse) {
  if (!task.modules.length) {
    return 0;
  }

  const total = task.modules.reduce((sum, module) => sum + Math.min(Math.max(module.percent, 0), 100), 0);
  return Math.round(total / task.modules.length);
}

export function adaptTaskStatusToRunStatus(status: BackendTaskStatus): RunStatus {
  switch (status) {
    case 'running':
      return 'running';
    case 'paused':
      return 'paused';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'aborted':
      return 'aborted';
    case 'review':
      return 'review';
    case 'pending':
    default:
      return 'idle';
  }
}
