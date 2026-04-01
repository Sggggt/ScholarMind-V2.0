import { routeMeta } from '../data/routeData';
import type { BackendTaskResponse } from '../types/backend';
import type { ChatMessage, ChatQuickAction, RecentSession, StageId } from '../types/app';
import { inferCurrentStage } from './stageAdapter';

const stageTitleMap = routeMeta.reduce<Record<string, string>>((acc, item) => {
  acc[item.id] = item.title;
  return acc;
}, {});

function formatTimestamp(iso?: string | null) {
  if (!iso) {
    return '刚刚';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '刚刚';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function nowTime() {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function getQuickActions(task: BackendTaskResponse): ChatQuickAction[] {
  const currentStage = inferCurrentStage(task);
  const actionsByStage: Record<StageId, ChatQuickAction[]> = {
    exploration: [
      { label: '查看任务流程', path: '/workflow' },
      { label: '进入领域探索', path: '/exploration', stageId: 'exploration' },
    ],
    literature: [
      { label: '查看任务流程', path: '/workflow' },
      { label: '进入文献阶段', path: '/literature', stageId: 'literature' },
    ],
    extraction: [
      { label: '查看任务流程', path: '/workflow' },
      { label: '进入信息提取', path: '/extraction', stageId: 'extraction' },
    ],
    trends: [
      { label: '查看任务流程', path: '/workflow' },
      { label: '进入趋势分析', path: '/trends', stageId: 'trends' },
    ],
    gaps: [
      { label: '查看任务流程', path: '/workflow' },
      { label: '进入研究缺口', path: '/gaps', stageId: 'gaps' },
    ],
    ideas: [
      { label: '查看任务流程', path: '/workflow' },
      { label: '进入构思生成', path: '/ideas', stageId: 'ideas' },
    ],
    repository: [
      { label: '查看任务流程', path: '/workflow' },
      { label: '进入代码仓库', path: '/repository', stageId: 'repository' },
    ],
    experiment: [
      { label: '查看任务流程', path: '/workflow' },
      { label: '查看实验设计', path: '/experiment', stageId: 'experiment' },
    ],
    'agent-run': [
      { label: '查看任务流程', path: '/workflow' },
      { label: '查看运行日志', path: '/agent-run', stageId: 'agent-run' },
    ],
    results: [
      { label: '查看任务流程', path: '/workflow' },
      { label: '查看实验结果', path: '/results', stageId: 'results' },
    ],
    writing: [
      { label: '查看任务流程', path: '/workflow' },
      { label: '查看论文写作', path: '/writing', stageId: 'writing' },
    ],
    validation: [
      { label: '查看任务流程', path: '/workflow' },
      { label: '查看评审验证', path: '/validation', stageId: 'validation' },
    ],
  };

  return actionsByStage[currentStage];
}

export function adaptTaskToSession(task: BackendTaskResponse): RecentSession {
  const currentStage = inferCurrentStage(task);
  const stageTitle = stageTitleMap[currentStage] ?? '工作台';
  const moduleLabel = task.current_module ?? 'M1';

  return {
    id: task.id,
    title: task.title,
    domain: task.description || task.topic,
    updatedAt: formatTimestamp(task.updated_at),
    stageLabel: `${moduleLabel} · ${stageTitle}`,
  };
}

export function buildDraftChatMessages(): ChatMessage[] {
  return [
    {
      id: 'draft-intro',
      role: 'assistant',
      timestamp: nowTime(),
      content:
        '输入研究课题后，ScholarMind 会直接创建真实后端任务，并把流程、日志和产物同步到当前会话。',
    },
  ];
}

export function buildTaskCreatedMessage(task: BackendTaskResponse): ChatMessage {
  const stageTitle = stageTitleMap[inferCurrentStage(task)] ?? '流程';

  return {
    id: `assistant-${task.id}-created`,
    role: 'assistant',
    timestamp: nowTime(),
    content: `任务已创建：${task.title}。当前已进入 ${stageTitle}。`,
    quickActions: getQuickActions(task),
  };
}

export function buildTaskSelectedMessage(task: BackendTaskResponse): ChatMessage {
  const stageTitle = stageTitleMap[inferCurrentStage(task)] ?? '流程';

  return {
    id: `assistant-${task.id}-selected`,
    role: 'assistant',
    timestamp: nowTime(),
    content: `已切换到任务“${task.title}”。当前状态为 ${task.status}，最近阶段是 ${stageTitle}。`,
    quickActions: [
      { label: '查看任务流程', path: '/workflow' },
      { label: '回到工作台', path: '/workspace' },
    ],
  };
}

export function buildTaskCompletedMessage(task: BackendTaskResponse): ChatMessage {
  return {
    id: `assistant-${task.id}-completed`,
    role: 'assistant',
    timestamp: nowTime(),
    content: `任务“${task.title}”已完成，可以继续查看实验结果、论文写作和评审验证。`,
    quickActions: [
      { label: '查看实验结果', path: '/results', stageId: 'results' },
      { label: '查看论文写作', path: '/writing', stageId: 'writing' },
      { label: '查看评审验证', path: '/validation', stageId: 'validation' },
    ],
  };
}
