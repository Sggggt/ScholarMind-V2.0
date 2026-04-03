import { routeMeta } from '../data/routeData';
import type {
  BackendChatMessageResponse,
  BackendChatSessionResponse,
  BackendTaskResponse,
} from '../types/backend';
import type {
  ChatMessage,
  ChatQuickAction,
  RecentSession,
  RunStatus,
  StageId,
  TaskCommand,
} from '../types/app';
import { inferCurrentStage } from './stageAdapter';

const stageTitleMap = routeMeta.reduce<Record<string, string>>((acc, item) => {
  acc[item.id] = item.title;
  return acc;
}, {});

const moduleToStageMap: Record<string, { stageId: StageId; path: string; title: string }> = {
  M1: { stageId: 'literature', path: '/literature', title: '文献综述' },
  M2: { stageId: 'gaps', path: '/gaps', title: '研究缺口' },
  M3: { stageId: 'ideas', path: '/ideas', title: '构思生成' },
  M4: { stageId: 'repository', path: '/repository', title: '代码仓库' },
  M5: { stageId: 'experiment', path: '/experiment', title: '实验设计' },
  M6: { stageId: 'agent-run', path: '/agent-run', title: 'Agent 运行' },
  M7: { stageId: 'results', path: '/results', title: '结果分析' },
  M8: { stageId: 'writing', path: '/writing', title: '论文写作' },
  M9: { stageId: 'validation', path: '/validation', title: '评审验证' },
};

const moduleNextMap: Partial<Record<string, { moduleId: string; label: string; path: string }>> = {
  M1: { moduleId: 'M2', label: '进入研究缺口', path: '/gaps' },
  M2: { moduleId: 'M3', label: '进入构思生成', path: '/ideas' },
  M3: { moduleId: 'M4', label: '进入代码仓库', path: '/repository' },
  M4: { moduleId: 'M5', label: '进入实验设计', path: '/experiment' },
  M5: { moduleId: 'M6', label: '进入 Agent 运行', path: '/agent-run' },
  M6: { moduleId: 'M7', label: '进入结果分析', path: '/results' },
  M7: { moduleId: 'M8', label: '进入论文写作', path: '/writing' },
  M8: { moduleId: 'M9', label: '进入评审验证', path: '/validation' },
};

const moduleSummaryMap: Record<string, string> = {
  M1: '核心文献、代表性方向和基础证据已经整理完成，可以开始收敛研究缺口。',
  M2: '趋势和缺口已经归纳完毕，下一步适合挑选候选方案并做优先级排序。',
  M3: '候选构思已经完成打分，可以继续进入代码与实现准备阶段。',
  M4: '代码仓库骨架和关键文件已经生成，适合继续查看实验设计与运行计划。',
  M5: '实验假设、指标和运行条件已经明确，可以继续执行 Agent 实验。',
  M6: '实验运行阶段已告一段落，建议先查看日志与中间结果，再决定是否继续分析。',
  M7: '结果分析已经形成结论，可以继续整理论文内容或回看关键指标。',
  M8: '论文草稿和章节内容已经形成，接下来建议进入评审与验证环节。',
  M9: '评审验证已经完成，整项研究任务可以进入最终交付与复查。',
};

const taskStatusLabelMap: Record<string, string> = {
  pending: '待开始',
  running: '执行中',
  paused: '已暂停',
  review: '待评审',
  completed: '已完成',
  failed: '执行失败',
  aborted: '已终止',
};

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

function normalizeTaskCommand(value: unknown): TaskCommand | undefined {
  return value === 'pause' || value === 'resume' || value === 'abort' || value === 'restart'
    ? value
    : undefined;
}

function uniqueActions(actions: ChatQuickAction[]) {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.label}|${action.path ?? ''}|${action.command ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function getTaskStatusLabel(status?: string | null) {
  if (!status) {
    return '对话准备';
  }

  return taskStatusLabelMap[status] ?? status;
}

export function formatSessionStageLabel(taskStatus?: string | null) {
  return taskStatus
    ? `${getTaskStatusLabel(taskStatus)} · 任务已绑定`
    : '对话准备 · 尚未创建任务';
}

function getQuickActions(task: BackendTaskResponse): ChatQuickAction[] {
  const currentStage = inferCurrentStage(task);
  const currentRoute = routeMeta.find((item) => item.id === currentStage);
  const actionStatus: RunStatus =
    task.status === 'running' ||
    task.status === 'paused' ||
    task.status === 'review' ||
    task.status === 'completed' ||
    task.status === 'failed' ||
    task.status === 'aborted'
      ? task.status
      : 'idle';

  return uniqueActions([
    { label: '查看任务流程', path: '/workflow' },
    currentRoute
      ? {
          label: `打开${currentRoute.title}`,
          path: currentRoute.path,
          stageId: currentStage,
        }
      : { label: '回到主聊天页', path: '/workspace' },
    ...buildTaskControlActions(actionStatus),
  ]);
}

export function getModuleStageMeta(moduleId?: string | null) {
  if (!moduleId) {
    return null;
  }

  return moduleToStageMap[moduleId] ?? null;
}

export function adaptChatSessionToSession(session: BackendChatSessionResponse): RecentSession {
  return {
    id: session.id,
    title: session.title,
    domain: session.summary || session.last_message_preview || '从对话中组织研究目标、约束和产出。',
    updatedAt: formatTimestamp(session.updated_at),
    stageLabel: session.task_id ? formatSessionStageLabel(session.task_status) : formatSessionStageLabel(),
    taskId: session.task_id ?? undefined,
    taskStatus: session.task_status ?? undefined,
  };
}

export function adaptBackendChatMessage(message: BackendChatMessageResponse): ChatMessage {
  const metadata = message.metadata ?? {};
  const quickActionsRaw = metadata.quick_actions;
  const quickActions = Array.isArray(quickActionsRaw)
    ? quickActionsRaw
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .map((item) => ({
          label: String(item.label ?? '打开'),
          path: item.path ? String(item.path) : undefined,
          command: normalizeTaskCommand(item.command),
        }))
        .filter((item) => item.path || item.command)
    : undefined;

  return {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: formatTimestamp(message.created_at),
    kind:
      message.kind === 'thinking'
        ? 'thinking'
        : message.kind === 'running-status'
          ? 'running-status'
        : message.kind === 'stage-transition'
          ? 'stage-transition'
          : 'text',
    quickActions,
  };
}

export function buildDraftChatMessages(): ChatMessage[] {
  return [
    {
      id: 'draft-intro',
      role: 'assistant',
      timestamp: nowTime(),
      kind: 'text',
      content:
        '先用对话把研究目标、约束和产出聊清楚，系统会在信息足够时自动创建并推进任务。',
    },
  ];
}

export function buildThinkingMessage(): ChatMessage {
  return {
    id: `thinking-${Date.now()}`,
    role: 'assistant',
    timestamp: nowTime(),
    kind: 'thinking',
    content: 'ScholarMind 正在整理当前任务的下一步行动。',
  };
}

export function buildTaskControlActions(runStatus: RunStatus): ChatQuickAction[] {
  if (runStatus === 'running') {
    return [
      { label: '重启任务', command: 'restart' },
      { label: '暂停任务', command: 'pause' },
      { label: '终止任务', command: 'abort' },
    ];
  }

  if (runStatus === 'paused') {
    return [
      { label: '重启任务', command: 'restart' },
      { label: '恢复任务', command: 'resume' },
      { label: '终止任务', command: 'abort' },
    ];
  }

  if (runStatus === 'completed' || runStatus === 'failed' || runStatus === 'aborted' || runStatus === 'review') {
    return [{ label: '重启任务', command: 'restart' }];
  }

  return [];
}

export function buildModuleCompletedMessage(
  task: BackendTaskResponse,
  moduleId: string,
): ChatMessage {
  const current = getModuleStageMeta(moduleId);
  const next = moduleNextMap[moduleId];
  const summary = moduleSummaryMap[moduleId] ?? '该阶段已经完成，当前产物可以继续查看。';

  return {
    id: `assistant-${task.id}-${moduleId}-completed-${Date.now()}`,
    role: 'assistant',
    timestamp: nowTime(),
    kind: 'text',
    content: [
      `**${current?.title ?? moduleId}已完成**`,
      summary,
      next
        ? `接下来我建议进入${next.label.replace('进入', '')}。你希望继续推进，还是先检查当前结果？`
        : '当前模块已经收尾。你可以先回看结果，也可以直接重启任务做新一轮执行。',
    ].join('\n'),
    quickActions: uniqueActions([
      { label: '查看任务流程', path: '/workflow' },
      current
        ? {
            label: `查看${current.title}`,
            path: current.path,
            stageId: current.stageId,
          }
        : { label: '回到主聊天页', path: '/workspace' },
      ...(next ? [{ label: next.label, path: next.path }] : []),
    ]),
  };
}

export function buildStageTransitionMessage(task: BackendTaskResponse, newModuleId: string): ChatMessage {
  const target = getModuleStageMeta(newModuleId);

  return {
    id: `assistant-${task.id}-${newModuleId}-transition-${Date.now()}`,
    role: 'assistant',
    timestamp: nowTime(),
    kind: 'running-status',
    content: `正在进入 **${target?.title ?? newModuleId}** 阶段，我会继续跟踪进展并在阶段完成后给你下一步建议。`,
    quickActions: uniqueActions([
      { label: '查看任务流程', path: '/workflow' },
      ...(target
        ? [
            {
              label: `打开${target.title}`,
              path: target.path,
              stageId: target.stageId,
            },
          ]
        : []),
    ]),
  };
}

export function buildTaskCompletedMessage(task: BackendTaskResponse): ChatMessage {
  return {
    id: `assistant-${task.id}-completed`,
    role: 'assistant',
    timestamp: nowTime(),
    kind: 'text',
    content: [
      `**任务《${task.title}》已完成**`,
      '我建议你先检查结果分析、论文写作和评审验证三部分产物，再决定是否发起新一轮重跑。',
      '如果你想继续优化，我也可以直接帮你重启当前任务。',
    ].join('\n'),
    quickActions: uniqueActions([
      { label: '查看结果分析', path: '/results', stageId: 'results' },
      { label: '查看论文写作', path: '/writing', stageId: 'writing' },
      { label: '查看评审验证', path: '/validation', stageId: 'validation' },
      { label: '查看任务流程', path: '/workflow' },
      { label: '重启任务', command: 'restart' },
    ]),
  };
}

export function buildTaskStatusMessage(task: BackendTaskResponse): ChatMessage | null {
  const current = getModuleStageMeta(task.current_module);
  const stageTitle = current?.title ?? stageTitleMap[inferCurrentStage(task)] ?? '当前阶段';

  if (task.status === 'completed') {
    return buildTaskCompletedMessage(task);
  }

  if (task.status === 'paused') {
    return {
      id: `assistant-${task.id}-paused`,
      role: 'assistant',
      timestamp: nowTime(),
      kind: 'text',
      content: [
        `**任务《${task.title}》已暂停**`,
        `当前执行停在 ${stageTitle} 阶段。你可以先检查现有结果，再决定恢复、终止还是直接重启。`,
        '如果你希望继续推进，点击“恢复任务”；如果想调整方向，也可以直接重启或在对话里补充新的要求。',
      ].join('\n'),
      quickActions: getQuickActions(task),
    };
  }

  if (task.status === 'aborted') {
    return {
      id: `assistant-${task.id}-aborted`,
      role: 'assistant',
      timestamp: nowTime(),
      kind: 'text',
      content: [
        `**任务《${task.title}》已终止**`,
        `我已经停止 ${stageTitle} 阶段的继续执行。建议你先检查当前产物，再决定是否基于现有方向重新启动一轮。`,
        '如果接下来要换题、改约束或缩小范围，直接在对话里告诉我即可。',
      ].join('\n'),
      quickActions: getQuickActions(task),
    };
  }

  if (task.status === 'failed') {
    return {
      id: `assistant-${task.id}-failed`,
      role: 'assistant',
      timestamp: nowTime(),
      kind: 'text',
      content: [
        `**任务《${task.title}》执行失败**`,
        `失败发生在 ${stageTitle} 阶段。建议你先查看当前阶段和任务流程，确认问题位置后再决定是否重启。`,
        '如果你想保留原方向，我可以直接帮你重启当前任务；如果要调整输入条件，也可以先在这里补充说明。',
      ].join('\n'),
      quickActions: getQuickActions(task),
    };
  }

  if (task.status === 'review') {
    return {
      id: `assistant-${task.id}-review`,
      role: 'assistant',
      timestamp: nowTime(),
      kind: 'text',
      content: [
        `**任务《${task.title}》进入评审等待**`,
        `主体执行已经结束，当前停在 ${stageTitle} 阶段。建议你先查看结果与验证材料，再决定是否开启下一轮。`,
        '如果你希望继续推进，我可以在这里协助你重启任务或针对评审意见调整方向。',
      ].join('\n'),
      quickActions: getQuickActions(task),
    };
  }

  return null;
}

export { moduleNextMap, moduleSummaryMap, moduleToStageMap, stageTitleMap };
