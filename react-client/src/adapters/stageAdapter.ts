import { initialStages } from '../data/routeData';
import type { BackendModuleProgress, BackendTaskResponse, BackendTaskStatus } from '../types/backend';
import type { RunStatus, RunStep, StageId, WorkflowStage, WorkflowStatus } from '../types/app';

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
    return module.step || module.message || `${title}正在执行。`;
  }

  if (module.status === 'failed') {
    return module.message || `${title}执行失败，请检查日志。`;
  }

  return `${title}尚未开始。`;
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
