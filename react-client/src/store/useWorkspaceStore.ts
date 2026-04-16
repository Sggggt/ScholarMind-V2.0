import { create } from 'zustand';
import { adaptLogs, adaptWsMessageToRunLog } from '../adapters/logAdapter';
import {
  adaptTaskStatusToRunStatus,
  adaptTaskToRunProgress,
  adaptTaskToRunSteps,
  adaptTaskToStages,
  buildIdleRunSteps,
  buildIdleStages,
  inferCurrentStage,
} from '../adapters/stageAdapter';
import {
  adaptBackendChatMessage,
  adaptChatSessionToSession,
  buildDraftChatMessages,
  buildModuleCompletedMessage,
  buildStageTransitionMessage,
  buildTaskControlActions,
  buildTaskStatusMessage,
  buildThinkingMessage,
  formatSessionStageLabel,
  getModuleStageMeta,
} from '../adapters/taskAdapter';
import type { BackendTaskResponse, BackendWsMessage } from '../types/backend';
import type {
  ChatMessage,
  RecentSession,
  RunLog,
  RunStatus,
  RunStep,
  StageId,
  TaskCommand,
  TransitionState,
  WorkflowStage,
} from '../types/app';
import {
  abortTask,
  clearTaskApiCache,
  createChatSession,
  deleteTask,
  deleteChatSession,
  getChatSession,
  getChatSessions,
  getTask,
  getTaskLogs,
  pauseTask,
  resetTaskModule,
  restartTask,
  resumeTask,
  sendChatMessage,
} from '../services/api';
import { buildTaskConfigOverrides, buildTaskDescription } from '../services/preferences';
import { clearPersistedState, loadPersistedState, persistState } from '../services/offlineCache';
import { toDisplayErrorMessage } from '../utils/errorMessage';

interface WorkspaceState {
  isAuthenticated: boolean;
  isInitializing: boolean;
  isSessionLoading: boolean;
  isSubmittingTask: boolean;
  isTaskLoading: boolean;
  isLogsLoading: boolean;
  isWebSocketConnected: boolean;
  isOfflineMode: boolean;
  mobileConnectionCount: number;
  taskError: string | null;
  toastMessage: string | null;
  transitionState: TransitionState | null;
  transitionLabel: string;
  currentSessionId: string;
  currentTaskId: string;
  currentStage: StageId;
  currentTask: BackendTaskResponse | null;
  stages: WorkflowStage[];
  sessions: RecentSession[];
  chatMessages: ChatMessage[];
  chatMessagesBySession: Record<string, ChatMessage[]>;
  tasksById: Record<string, BackendTaskResponse>;
  runSteps: RunStep[];
  runLogs: RunLog[];
  runLogsBySession: Record<string, RunLog[]>;
  runProgress: number;
  runStatus: RunStatus;
  lastCompletedModule: string;
  lastStartedModule: string;
  activePaperId: string;
  selectedIdeaIds: string[];
  login: (email: string) => void;
  logout: () => void;
  showToast: (message: string) => void;
  clearToast: () => void;
  showTransition: (state: TransitionState, label: string) => void;
  clearTransition: () => void;
  setWebSocketStatus: (connected: boolean) => void;
  setMobileConnectionCount: (count: number) => void;
  initializeWorkspaceData: () => Promise<void>;
  refreshTask: (taskId: string, options?: { background?: boolean }) => Promise<void>;
  refreshCurrentTask: (options?: { background?: boolean }) => Promise<void>;
  refreshLogs: (taskId?: string) => Promise<void>;
  pauseCurrentTask: () => Promise<void>;
  resumeCurrentTask: () => Promise<void>;
  abortCurrentTask: () => Promise<void>;
  restartCurrentTask: () => Promise<void>;
  resetCurrentStageTask: (moduleId: string) => Promise<void>;
  executeTaskCommand: (command: TaskCommand) => Promise<void>;
  submitWorkspacePrompt: (topic: string) => Promise<void>;
  handleWsMessage: (message: BackendWsMessage) => void;
  openStage: (stageId: StageId) => void;
  addChatMessage: (content: string) => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  deleteTaskHistory: (taskId: string) => Promise<void>;
  createSession: () => Promise<string>;
  setActivePaper: (paperId: string) => void;
  setSelectedIdeas: (ideaIds: string[]) => void;
}

const draftChatMessages = buildDraftChatMessages();
const idleStages = buildIdleStages();
const idleRunSteps = buildIdleRunSteps();
let toastTimer: number | null = null;
let transitionTimer: number | null = null;
let sessionListRequestSeq = 0;
let sessionSelectionRequestSeq = 0;
let sessionCreationRequestSeq = 0;
let persistTimer: number | null = null;

function resetPersistTimer() {
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
}

function schedulePersist(state: WorkspaceState) {
  resetPersistTimer();
  persistTimer = window.setTimeout(() => {
    persistState(state.sessions, state.tasksById, state.chatMessagesBySession);
  }, 2000);
}

function resetToastTimer() {
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
}

function resetTransitionTimer() {
  if (transitionTimer !== null) {
    window.clearTimeout(transitionTimer);
    transitionTimer = null;
  }
}

function getErrorMessage(error: unknown) {
  return toDisplayErrorMessage(error, '请求失败，请稍后重试。');
}

function nowTime() {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function moduleOrder(moduleId?: string | null) {
  if (!moduleId) {
    return 0;
  }

  const matched = /^M(\d+)$/.exec(moduleId);
  return matched ? Number(matched[1]) : 0;
}

function upsertSession(sessions: RecentSession[], nextSession: RecentSession) {
  const filtered = sessions.filter((session) => session.id !== nextSession.id);
  return [nextSession, ...filtered];
}

function removeThinkingMessages(messages: ChatMessage[]) {
  return messages.filter((message) => message.kind !== 'thinking');
}

function dedupeMessages(messages: ChatMessage[]) {
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (seen.has(message.id)) {
      return false;
    }

    seen.add(message.id);
    return true;
  });
}

function isTerminalTaskStatus(status?: string) {
  return status === 'completed' || status === 'failed' || status === 'aborted';
}

function pickDefaultSessionId(sessions: RecentSession[], preferredSessionId = '') {
  if (preferredSessionId && sessions.some((session) => session.id === preferredSessionId)) {
    return preferredSessionId;
  }

  // Sort by updatedAt descending to get the most recent session
  const sortedByUpdatedAt = [...sessions].sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  const activeTaskSession = sortedByUpdatedAt.find((session) => session.taskId && !isTerminalTaskStatus(session.taskStatus));
  if (activeTaskSession) {
    return activeTaskSession.id;
  }

  const linkedTaskSession = sortedByUpdatedAt.find((session) => session.taskId);
  if (linkedTaskSession) {
    return linkedTaskSession.id;
  }

  return sortedByUpdatedAt[0]?.id ?? '';
}

function findSessionIdByTask(state: WorkspaceState, taskId: string) {
  // Find all sessions for this task, sort by updatedAt descending (most recent first)
  const taskSessions = state.sessions
    .filter((session) => session.taskId === taskId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return taskSessions[0]?.id ?? '';
}

function appendMessagesToSession(state: WorkspaceState, sessionId: string, messages: ChatMessage[]) {
  if (!sessionId || !messages.length) {
    return {};
  }

  const existingMessages = state.chatMessagesBySession[sessionId] ?? draftChatMessages;
  const nextMessages = dedupeMessages([...existingMessages, ...messages]);

  return {
    chatMessagesBySession: {
      ...state.chatMessagesBySession,
      [sessionId]: nextMessages,
    },
    ...(state.currentSessionId === sessionId ? { chatMessages: nextMessages } : {}),
  };
}

function withTaskStatusMessage(messages: ChatMessage[], task?: BackendTaskResponse | null) {
  if (!task) {
    return messages;
  }

  const statusMessage = buildTaskStatusMessage(task);
  return statusMessage ? dedupeMessages([...messages, statusMessage]) : messages;
}

function appendTaskStatusMessage(state: WorkspaceState, sessionId: string, task?: BackendTaskResponse | null) {
  if (!sessionId || !task) {
    return {};
  }

  const statusMessage = buildTaskStatusMessage(task);
  return statusMessage ? appendMessagesToSession(state, sessionId, [statusMessage]) : {};
}

function removeTaskHistoryState(state: WorkspaceState, taskId: string) {
  const removedSessionIds = new Set(
    state.sessions.filter((session) => session.taskId === taskId).map((session) => session.id),
  );
  const sessions = state.sessions.filter((session) => session.taskId !== taskId);

  const chatMessagesBySession = Object.fromEntries(
    Object.entries(state.chatMessagesBySession).filter(([sessionId]) => !removedSessionIds.has(sessionId)),
  );
  const { [taskId]: removedTask, ...tasksById } = state.tasksById;
  const { [taskId]: removedLogs, ...runLogsBySession } = state.runLogsBySession;
  void removedTask;
  void removedLogs;

  const deletingCurrentSession = removedSessionIds.has(state.currentSessionId);
  const nextSessionId = deletingCurrentSession ? pickDefaultSessionId(sessions) : state.currentSessionId;
  const nextMessages = nextSessionId ? chatMessagesBySession[nextSessionId] ?? draftChatMessages : draftChatMessages;
  const deletingCurrentTask = state.currentTaskId === taskId;

  return {
    sessions,
    chatMessagesBySession,
    tasksById,
    runLogsBySession,
    currentSessionId: nextSessionId,
    ...(deletingCurrentSession ? { chatMessages: nextMessages, isSessionLoading: Boolean(nextSessionId) } : {}),
    ...(deletingCurrentTask ? resetTaskView() : {}),
  };
}

function syncSessionTaskState(sessions: RecentSession[], task: BackendTaskResponse) {
  return sessions.map((session) =>
    session.taskId === task.id
      ? {
          ...session,
          taskStatus: task.status,
          stageLabel: formatSessionStageLabel(task.status),
          updatedAt: new Intl.DateTimeFormat('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(new Date(task.updated_at)),
        }
      : session,
  );
}

function resetTaskView() {
  return {
    currentTaskId: '',
    currentTask: null,
    currentStage: 'literature' as StageId,
    stages: idleStages,
    runSteps: idleRunSteps,
    runLogs: [],
    runProgress: 0,
    runStatus: 'idle' as RunStatus,
    isWebSocketConnected: false,
    lastCompletedModule: '',
    lastStartedModule: '',
    activePaperId: '',
    selectedIdeaIds: [],
  };
}

function applyTaskView(state: WorkspaceState, task: BackendTaskResponse) {
  return {
    currentTaskId: task.id,
    currentTask: task,
    currentStage: inferCurrentStage(task),
    stages: adaptTaskToStages(task),
    runSteps: adaptTaskToRunSteps(task),
    runProgress: adaptTaskToRunProgress(task),
    runStatus: adaptTaskStatusToRunStatus(task.status),
    runLogs: state.runLogsBySession[task.id] ?? [],
  };
}

function mergeTaskWithWsMessage(task: BackendTaskResponse, message: BackendWsMessage): BackendTaskResponse {
  const nowIso = new Date().toISOString();
  const agentPatch =
    message.data && typeof message.data === 'object'
      ? {
          active_cycle: (message.data.active_cycle as Record<string, unknown> | undefined) ?? task.active_cycle ?? null,
          root_agent: (message.data.root_agent as Record<string, unknown> | undefined) ?? task.root_agent ?? null,
          child_agents: Array.isArray(message.data.child_agents) ? (message.data.child_agents as Array<Record<string, unknown>>) : task.child_agents ?? [],
          recent_summary: (message.data.recent_summary as Record<string, unknown> | undefined) ?? task.recent_summary ?? null,
        }
      : {
          active_cycle: task.active_cycle ?? null,
          root_agent: task.root_agent ?? null,
          child_agents: task.child_agents ?? [],
          recent_summary: task.recent_summary ?? null,
        };

  if (message.type === 'agent_tree' || message.type === 'agent_event' || message.type === 'agent_summary') {
    return {
      ...task,
      ...agentPatch,
      updated_at: nowIso,
    };
  }

  if (message.type === 'completed') {
    return {
      ...task,
      ...agentPatch,
      status: 'completed',
      updated_at: nowIso,
      completed_at: nowIso,
      modules: task.modules.map((module) => ({
        ...module,
        status: 'completed',
        percent: 100,
        finished_at: module.finished_at ?? nowIso,
      })),
    };
  }

  if (message.type === 'need_review') {
    return {
      ...task,
      ...agentPatch,
      status: 'review',
      updated_at: nowIso,
    };
  }

  if (message.type === 'error') {
    return {
      ...task,
      ...agentPatch,
      status: 'failed',
      updated_at: nowIso,
      modules: task.modules.map((module) =>
        module.module_id === (message.module ?? task.current_module)
          ? {
              ...module,
              status: 'failed',
              message: message.message || module.message,
            }
          : module,
      ),
    };
  }

  if (message.type !== 'progress') {
    return task;
  }

  const targetModuleId = message.module ?? task.current_module ?? 'M1';
  const targetOrder = moduleOrder(targetModuleId);
  const existingTarget = task.modules.find((module) => module.module_id === targetModuleId);
  const nextPercent =
    typeof message.percent === 'number' && Number.isFinite(message.percent) && message.percent > 0
      ? message.percent
      : existingTarget?.percent || (task.current_module !== targetModuleId ? 10 : 0);

  return {
    ...task,
    ...agentPatch,
    status: 'running',
    current_module: targetModuleId,
    updated_at: nowIso,
    modules: task.modules.map((module) => {
      const order = moduleOrder(module.module_id);

      if (order < targetOrder) {
        return {
          ...module,
          status: 'completed',
          percent: 100,
          finished_at: module.finished_at ?? nowIso,
        };
      }

      if (module.module_id === targetModuleId) {
        return {
          ...module,
          status: 'running',
          percent: nextPercent,
          step: message.step ?? module.step,
          message: message.message || module.message,
          started_at: module.started_at ?? nowIso,
          finished_at: undefined,
        };
      }

      if (order > targetOrder) {
        return {
          ...module,
          status: 'waiting',
          percent: 0,
          step: '',
        };
      }

      return module;
    }),
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  isAuthenticated: false,
  isInitializing: false,
  isSessionLoading: false,
  isSubmittingTask: false,
  isTaskLoading: false,
  isLogsLoading: false,
  isWebSocketConnected: false,
  isOfflineMode: false,
  mobileConnectionCount: 0,
  taskError: null,
  toastMessage: null,
  transitionState: null,
  transitionLabel: '',
  currentSessionId: '',
  currentTaskId: '',
  currentStage: 'literature',
  currentTask: null,
  stages: idleStages,
  sessions: [],
  chatMessages: draftChatMessages,
  chatMessagesBySession: {},
  tasksById: {},
  runSteps: idleRunSteps,
  runLogs: [],
  runLogsBySession: {},
  runProgress: 0,
  runStatus: 'idle',
  lastCompletedModule: '',
  lastStartedModule: '',
  activePaperId: '',
  selectedIdeaIds: [],
  login: () => set({ isAuthenticated: true }),
  logout: () =>
    set({
      isAuthenticated: false,
      currentSessionId: '',
      isSessionLoading: false,
      transitionState: null,
      transitionLabel: '',
      sessions: [],
      chatMessages: draftChatMessages,
      chatMessagesBySession: {},
      tasksById: {},
      toastMessage: null,
      taskError: null,
      ...resetTaskView(),
    }),
  showToast: (message) => {
    resetToastTimer();
    set({ toastMessage: message });
    toastTimer = window.setTimeout(() => {
      set({ toastMessage: null });
      toastTimer = null;
    }, 2400);
  },
  clearToast: () => {
    resetToastTimer();
    set({ toastMessage: null });
  },
  showTransition: (state, label) => {
    resetTransitionTimer();
    set({ transitionState: state, transitionLabel: label });
    transitionTimer = window.setTimeout(() => {
      set({ transitionState: null, transitionLabel: '' });
      transitionTimer = null;
    }, 2000);
  },
  clearTransition: () => {
    resetTransitionTimer();
    set({ transitionState: null, transitionLabel: '' });
  },
  setWebSocketStatus: (connected) => set({ isWebSocketConnected: connected }),
  setMobileConnectionCount: (count) => set({ mobileConnectionCount: count }),
  initializeWorkspaceData: async () => {
    if (get().isInitializing) {
      return;
    }

    const requestId = ++sessionListRequestSeq;
    set({ isInitializing: true, taskError: null });

    try {
      const backendSessions = await getChatSessions();
      if (requestId !== sessionListRequestSeq) {
        return;
      }

      const sessions = backendSessions.map(adaptChatSessionToSession);
      const fallbackSessionId = pickDefaultSessionId(sessions, get().currentSessionId);

      set({
        sessions,
        currentSessionId: fallbackSessionId,
        isOfflineMode: false,
      });

      // Clear persisted state since backend is healthy
      clearPersistedState();

      if (fallbackSessionId) {
        await get().selectSession(fallbackSessionId);
      } else {
        set({
          ...resetTaskView(),
          chatMessages: draftChatMessages,
        });
      }
    } catch (error) {
      if (requestId === sessionListRequestSeq) {
        // Try to recover from localStorage
        const persisted = loadPersistedState();
        if (persisted && (persisted.sessions as unknown[]).length > 0) {
          const sessions = persisted.sessions as RecentSession[];
          const fallbackSessionId = pickDefaultSessionId(sessions, get().currentSessionId);
          const tasksById = persisted.tasksById as Record<string, BackendTaskResponse>;
          const chatMessagesBySession = persisted.chatMessagesBySession as Record<string, ChatMessage[]>;

          set({
            sessions,
            tasksById,
            chatMessagesBySession,
            currentSessionId: fallbackSessionId,
            chatMessages: fallbackSessionId ? chatMessagesBySession[fallbackSessionId] ?? draftChatMessages : draftChatMessages,
            isOfflineMode: true,
            isInitializing: false,
            taskError: '后端服务不可用，显示缓存数据',
          });
          return;
        }

        set({
          taskError: getErrorMessage(error),
        });
      }
    } finally {
      if (requestId === sessionListRequestSeq) {
        set({ isInitializing: false });
      }
    }
  },
  refreshTask: async (taskId, options) => {
    if (!taskId) {
      return;
    }

    const background = Boolean(options?.background);
    if (!background) {
      set({ isTaskLoading: true, taskError: null });
    }

    try {
      const task = await getTask(taskId);

      set((state) => {
        const targetSessionId = findSessionIdByTask(state, task.id);

        return {
          ...(background ? {} : { isTaskLoading: false }),
          tasksById: { ...state.tasksById, [task.id]: task },
          sessions: syncSessionTaskState(state.sessions, task),
          ...(state.currentTaskId === task.id ? applyTaskView(state, task) : {}),
          ...appendTaskStatusMessage(state, targetSessionId, task),
        };
      });
    } catch (error) {
      set({
        ...(background ? {} : { isTaskLoading: false }),
        taskError: getErrorMessage(error),
      });
    }
  },
  refreshCurrentTask: async (options) => {
    const currentTaskId = get().currentTaskId;

    if (!currentTaskId) {
      return;
    }

    await get().refreshTask(currentTaskId, options);
  },
  refreshLogs: async (taskId) => {
    const targetTaskId = taskId ?? get().currentTaskId;
    if (!targetTaskId) {
      return;
    }

    set({ isLogsLoading: true, taskError: null });

    try {
      const logs = adaptLogs(await getTaskLogs(targetTaskId));

      set((state) => ({
        isLogsLoading: false,
        runLogsBySession: { ...state.runLogsBySession, [targetTaskId]: logs },
        ...(state.currentTaskId === targetTaskId ? { runLogs: logs } : {}),
      }));
    } catch (error) {
      set({
        isLogsLoading: false,
        taskError: getErrorMessage(error),
      });
    }
  },
  pauseCurrentTask: async () => {
    const taskId = get().currentTaskId;
    if (!taskId) {
      return;
    }

    set({ isTaskLoading: true, taskError: null });

    try {
      await pauseTask(taskId);
      await get().refreshTask(taskId, { background: true });
      get().showToast('任务已暂停');
    } catch (error) {
      set({ taskError: getErrorMessage(error) });
    } finally {
      set({ isTaskLoading: false });
    }
  },
  resumeCurrentTask: async () => {
    const taskId = get().currentTaskId;
    if (!taskId) {
      return;
    }

    set({ isTaskLoading: true, taskError: null });

    try {
      await resumeTask(taskId);
      await get().refreshTask(taskId, { background: true });
      get().showToast('任务已恢复');
    } catch (error) {
      set({ taskError: getErrorMessage(error) });
    } finally {
      set({ isTaskLoading: false });
    }
  },
  abortCurrentTask: async () => {
    const taskId = get().currentTaskId;
    if (!taskId) {
      return;
    }

    set({ isTaskLoading: true, taskError: null });
    get().showTransition('aborting', '正在终止任务...');

    try {
      await abortTask(taskId);
      await get().refreshTask(taskId, { background: true });
      get().showToast('任务已终止');
    } catch (error) {
      set({ taskError: getErrorMessage(error) });
    } finally {
      set({ isTaskLoading: false });
    }
  },
  restartCurrentTask: async () => {
    const currentTask = get().currentTask;
    if (!currentTask) {
      return;
    }

    set({ isTaskLoading: true, taskError: null });
    get().showTransition('restarting', '正在重启任务...');

    try {
      const nextTask = await restartTask(currentTask.id);

      if (!nextTask) {
        throw new Error('当前后端未提供任务重启结果，已停止前端回退到从 M1 新建任务的旧逻辑。');
      }

      const targetSessionId = get().currentSessionId || findSessionIdByTask(get(), currentTask.id);
      const restartMessage: ChatMessage = {
        id: `assistant-${nextTask.id}-restart-${Date.now()}`,
        role: 'assistant',
        timestamp: nowTime(),
        kind: 'text',
        content: [
          '**任务已重启**',
          '我已经基于当前研究主题重新创建执行任务，并会继续在这里同步每个阶段的完成反馈。',
          '如果你想修改方向，可以直接在对话里告诉我，我会据此继续调整。',
        ].join('\n'),
        quickActions: [
          { label: '查看任务流程', path: '/workflow' },
          { label: '打开文献综述', path: '/literature', stageId: 'literature' },
          ...buildTaskControlActions('running'),
        ],
      };

      set((state) => {
        const nextTasksById = { ...state.tasksById, [nextTask.id]: nextTask };
        const sessionPatch = targetSessionId
          ? appendMessagesToSession(state, targetSessionId, [restartMessage])
          : {};

        return {
          isTaskLoading: false,
          tasksById: nextTasksById,
          sessions: state.sessions.map((session) =>
            session.id === targetSessionId
              ? {
                  ...session,
                  taskId: nextTask.id,
                  taskStatus: nextTask.status,
                  stageLabel: formatSessionStageLabel(nextTask.status),
                }
              : session,
          ),
          lastCompletedModule: '',
          lastStartedModule: '',
          ...applyTaskView({ ...state, tasksById: nextTasksById }, nextTask),
          ...sessionPatch,
        };
      });

      get().showToast('任务已重启');
      await Promise.all([get().refreshTask(nextTask.id, { background: true }), get().refreshLogs(nextTask.id)]);
    } catch (error) {
      set({
        isTaskLoading: false,
        taskError: getErrorMessage(error),
      });
    }
  },
  resetCurrentStageTask: async (moduleId) => {
    const currentTask = get().currentTask;
    if (!currentTask || !moduleId) {
      return;
    }

    set({ isTaskLoading: true, taskError: null });
    get().showTransition('restarting', `正在重跑 ${moduleId}...`);

    try {
      const nextTask = await resetTaskModule(currentTask.id, moduleId);

      if (!nextTask) {
        throw new Error('当前后端未返回阶段重跑结果。');
      }

      set((state) => {
        const nextTasksById = { ...state.tasksById, [nextTask.id]: nextTask };
        return {
          isTaskLoading: false,
          tasksById: nextTasksById,
          sessions: syncSessionTaskState(state.sessions, nextTask),
          lastCompletedModule: '',
          lastStartedModule: '',
          ...applyTaskView({ ...state, tasksById: nextTasksById }, nextTask),
        };
      });

      get().showToast(`已请求重跑 ${moduleId}。`);
      await Promise.all([get().refreshTask(nextTask.id, { background: true }), get().refreshLogs(nextTask.id)]);
    } catch (error) {
      set({
        isTaskLoading: false,
        taskError: getErrorMessage(error),
      });
    }
  },
  executeTaskCommand: async (command) => {
    if (command === 'pause') {
      await get().pauseCurrentTask();
      return;
    }

    if (command === 'resume') {
      await get().resumeCurrentTask();
      return;
    }

    if (command === 'abort') {
      if (!window.confirm('确认终止当前任务吗？')) {
        return;
      }

      await get().abortCurrentTask();
      return;
    }

    if (!window.confirm('确认重启当前任务吗？这会开始一轮新的执行。')) {
      return;
    }

    await get().restartCurrentTask();
  },
  submitWorkspacePrompt: async (topic) => {
    await get().addChatMessage(topic);
  },
  handleWsMessage: (message) => {
    // Handle global message types
    if (message.type === 'task_created' && message.data?.task) {
      const task = message.data.task as BackendTaskResponse;
      set((state) => ({
        tasksById: { ...state.tasksById, [task.id]: task },
      }));
      return;
    }

    if (message.type === 'task_deleted') {
      set((state) => ({
        ...removeTaskHistoryState(state, message.task_id),
      }));
      return;
    }

    if (message.type === 'connection_update' && message.data?.mobile_connection_count != null) {
      set({ mobileConnectionCount: message.data.mobile_connection_count as number });
      return;
    }

    let pendingTransition: { state: TransitionState; label: string } | null = null;
    clearTaskApiCache(message.task_id);

    set((state) => {
      const nextLog = adaptWsMessageToRunLog(message);
      const existingLogs = state.runLogsBySession[message.task_id] ?? [];
      const runLogsBySession = {
        ...state.runLogsBySession,
        [message.task_id]: [...existingLogs, nextLog],
      };

      const patch: Partial<WorkspaceState> = {
        runLogsBySession,
        ...(state.currentTaskId === message.task_id ? { runLogs: runLogsBySession[message.task_id] } : {}),
      };

      const currentTaskSnapshot = state.tasksById[message.task_id] ?? (state.currentTaskId === message.task_id ? state.currentTask : null);
      const previousModule = currentTaskSnapshot?.current_module ?? null;
      const nextTaskSnapshot = currentTaskSnapshot ? mergeTaskWithWsMessage(currentTaskSnapshot, message) : null;

      if (nextTaskSnapshot) {
        const nextTasksById = { ...state.tasksById, [nextTaskSnapshot.id]: nextTaskSnapshot };
        patch.tasksById = nextTasksById;
        patch.sessions = syncSessionTaskState(state.sessions, nextTaskSnapshot);

        if (state.currentTaskId === message.task_id) {
          Object.assign(
            patch,
            applyTaskView({ ...state, runLogsBySession, tasksById: nextTasksById }, nextTaskSnapshot),
          );
        }
      }

      if (message.type === 'error') {
        patch.taskError = toDisplayErrorMessage(message.message, '任务执行失败，请查看日志后重试。');
      }

      const targetSessionId = findSessionIdByTask(state, message.task_id);
      const pendingMessages: ChatMessage[] = [];
      const nextModule = message.module ?? nextTaskSnapshot?.current_module ?? null;
      const previousOrder = moduleOrder(previousModule);
      const nextOrder = moduleOrder(nextModule);

      if (message.type === 'progress' && message.step === 'done' && nextTaskSnapshot && nextModule) {
        if (state.lastCompletedModule !== nextModule) {
          pendingMessages.push(buildModuleCompletedMessage(nextTaskSnapshot, nextModule));
          patch.lastCompletedModule = nextModule;
        }
      }

      if (message.type === 'progress' && message.step === 'start' && nextTaskSnapshot && nextModule) {
        if (state.lastStartedModule !== nextModule) {
          pendingMessages.push(buildStageTransitionMessage(nextTaskSnapshot, nextModule));
          patch.lastStartedModule = nextModule;
          pendingTransition = {
            state: 'stage-change',
            label: `姝ｅ湪杩涘叆${getModuleStageMeta(nextModule)?.title ?? nextModule}闃舵...`,
          };
        }
      }

      if (message.type === 'progress' && previousModule && nextModule && nextModule !== previousModule && nextOrder <= previousOrder) {
        if (nextOrder <= previousOrder) {
          patch.lastCompletedModule = '';
          patch.lastStartedModule = '';
        }

        const canAppendCompleted =
          previousOrder > 0 &&
          state.lastCompletedModule !== previousModule &&
          (nextOrder > previousOrder || previousOrder === 9);

        if (canAppendCompleted && nextTaskSnapshot) {
          pendingMessages.push(
            buildModuleCompletedMessage(
              nextTaskSnapshot,
              previousModule,
            ),
          );
          patch.lastCompletedModule = previousModule;
        }

        if (nextTaskSnapshot) {
          pendingMessages.push(buildStageTransitionMessage(nextTaskSnapshot, nextModule));
          pendingTransition = {
            state: 'stage-change',
            label: `正在进入${getModuleStageMeta(nextModule)?.title ?? nextModule}阶段...`,
          };
        }
      }

      if ((message.type === 'completed' || message.type === 'error' || message.type === 'need_review') && nextTaskSnapshot) {
        const taskStatusMessage = buildTaskStatusMessage(nextTaskSnapshot);
        if (taskStatusMessage) {
          pendingMessages.push(taskStatusMessage);
        }
      }

      if (message.type === 'completed' && nextTaskSnapshot) {
        pendingTransition = {
          state: 'completed',
          label: '研究任务已完成',
        };
      }

      if (pendingMessages.length && targetSessionId) {
        Object.assign(patch, appendMessagesToSession(state, targetSessionId, pendingMessages));
      }

      return patch;
    });

    if (pendingTransition) {
      const nextTransition = pendingTransition as { state: TransitionState; label: string };
      get().showTransition(nextTransition.state, nextTransition.label);
    }
  },
  openStage: (stageId) => set({ currentStage: stageId }),
  addChatMessage: async (content) => {
    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return;
    }

    set({ isSubmittingTask: true, taskError: null });

    let sessionId = get().currentSessionId;

    try {
      if (!sessionId) {
        sessionCreationRequestSeq += 1;
        sessionSelectionRequestSeq += 1;
        set({ isSessionLoading: true });

        const created = await createChatSession();
        const newSession = adaptChatSessionToSession(created.session);
        const initialMessages = created.messages.map(adaptBackendChatMessage);
        sessionId = created.session.id;

        set((state) => ({
          sessions: upsertSession(state.sessions, newSession),
          currentSessionId: sessionId,
          chatMessagesBySession: {
            ...state.chatMessagesBySession,
            [sessionId]: initialMessages,
          },
          chatMessages: initialMessages,
          isSessionLoading: false,
          ...(created.task
            ? {
                tasksById: { ...state.tasksById, [created.task.id]: created.task },
                ...applyTaskView(state, created.task),
              }
            : resetTaskView()),
        }));
      }

      const optimisticUserMessage: ChatMessage = {
        id: `local-user-${Date.now()}`,
        role: 'user',
        content: trimmedContent,
        timestamp: nowTime(),
        kind: 'text',
      };
      const thinkingMessage = buildThinkingMessage();

      set((state) => {
        const existingMessages = state.chatMessagesBySession[sessionId] ?? [];
        const nextMessages = [...existingMessages, optimisticUserMessage, thinkingMessage];
        return {
          chatMessagesBySession: {
            ...state.chatMessagesBySession,
            [sessionId]: nextMessages,
          },
          chatMessages: state.currentSessionId === sessionId ? nextMessages : state.chatMessages,
        };
      });

      const response = await sendChatMessage(sessionId, {
        content: trimmedContent,
        task_description: buildTaskDescription(trimmedContent),
        task_config: buildTaskConfigOverrides(),
      });

      const session = adaptChatSessionToSession(response.session);
      const userMessage = adaptBackendChatMessage(response.user_message);
      const assistantMessage = adaptBackendChatMessage(response.assistant_message);

      set((state) => {
        const existingMessages = removeThinkingMessages(state.chatMessagesBySession[sessionId] ?? []);
        const withoutLocalUser = existingMessages.filter((message) => message.id !== optimisticUserMessage.id);
        const nextMessages = [...withoutLocalUser, userMessage, assistantMessage];
        const nextTasksById = response.task ? { ...state.tasksById, [response.task.id]: response.task } : state.tasksById;
        const shouldRevealSession = !state.currentSessionId || state.currentSessionId === session.id;

        return {
          isSubmittingTask: false,
          sessions: upsertSession(state.sessions, {
            ...session,
            taskId: response.task?.id ?? session.taskId,
          }),
          chatMessagesBySession: {
            ...state.chatMessagesBySession,
            [session.id]: nextMessages,
          },
          tasksById: nextTasksById,
          lastCompletedModule: '',
          lastStartedModule: '',
          ...(shouldRevealSession
            ? {
                currentSessionId: session.id,
                chatMessages: nextMessages,
                ...(response.task
                  ? applyTaskView({ ...state, tasksById: nextTasksById }, response.task)
                  : resetTaskView()),
              }
            : {}),
        };
      });

      if (response.task_created && response.task) {
        get().showTransition('creating', '正在初始化研究任务...');
      }

      if (response.task) {
        await Promise.all([get().refreshTask(response.task.id, { background: true }), get().refreshLogs(response.task.id)]);
      }
    } catch (error) {
      set((state) => ({
        isSubmittingTask: false,
        isSessionLoading: false,
        taskError: getErrorMessage(error),
        chatMessagesBySession: sessionId
          ? {
              ...state.chatMessagesBySession,
              [sessionId]: removeThinkingMessages(state.chatMessagesBySession[sessionId] ?? []),
            }
          : state.chatMessagesBySession,
        chatMessages: sessionId
          ? state.currentSessionId === sessionId
            ? removeThinkingMessages(state.chatMessagesBySession[sessionId] ?? [])
            : state.chatMessages
          : state.chatMessages,
      }));
    }
  },
  selectSession: async (sessionId) => {
    const requestId = ++sessionSelectionRequestSeq;
    set({ currentSessionId: sessionId, isSessionLoading: true, taskError: null });

    try {
      const detail = await getChatSession(sessionId);
      if (requestId !== sessionSelectionRequestSeq) {
        return;
      }

      const session = adaptChatSessionToSession(detail.session);
      const messages = detail.messages.map(adaptBackendChatMessage);
      const nextMessages = withTaskStatusMessage(messages.length ? messages : draftChatMessages, detail.task);

      set((state) => {
        const nextTasksById = detail.task ? { ...state.tasksById, [detail.task.id]: detail.task } : state.tasksById;
        return {
          isSessionLoading: false,
          currentSessionId: session.id,
          sessions: upsertSession(state.sessions, {
            ...session,
            taskId: detail.task?.id ?? session.taskId,
          }),
          chatMessagesBySession: {
            ...state.chatMessagesBySession,
            [session.id]: nextMessages,
          },
          chatMessages: nextMessages,
          tasksById: nextTasksById,
          lastCompletedModule: '',
          lastStartedModule: '',
          ...(detail.task ? applyTaskView({ ...state, tasksById: nextTasksById }, detail.task) : resetTaskView()),
        };
      });

      if (detail.task && requestId === sessionSelectionRequestSeq) {
        await get().refreshLogs(detail.task.id);
      }
    } catch (error) {
      if (requestId === sessionSelectionRequestSeq) {
        set({
          isSessionLoading: false,
          taskError: getErrorMessage(error),
        });
      }
    }
  },
  deleteSession: async (sessionId) => {
    try {
      await deleteChatSession(sessionId);

      set((state) => {
        const sessions = state.sessions.filter((session) => session.id !== sessionId);
        const { [sessionId]: removedChat, ...chatMessagesBySession } = state.chatMessagesBySession;
        const deletingCurrent = state.currentSessionId === sessionId;
        const nextSessionId = deletingCurrent ? pickDefaultSessionId(sessions) : state.currentSessionId;
        const nextMessages = nextSessionId ? chatMessagesBySession[nextSessionId] ?? draftChatMessages : draftChatMessages;
        void removedChat;

        return {
          sessions,
          chatMessagesBySession,
          currentSessionId: nextSessionId,
          ...(deletingCurrent ? { isSessionLoading: Boolean(nextSessionId) } : {}),
          ...(deletingCurrent ? { chatMessages: nextMessages } : {}),
          ...(deletingCurrent && !nextSessionId ? resetTaskView() : {}),
        };
      });

      const nextSessionId = get().currentSessionId;
      if (nextSessionId) {
        await get().selectSession(nextSessionId);
      } else {
        set({ chatMessages: draftChatMessages });
      }
    } catch (error) {
      set({ taskError: getErrorMessage(error) });
    }
  },
  deleteTaskHistory: async (taskId) => {
    try {
      await deleteTask(taskId);

      set((state) => ({
        ...removeTaskHistoryState(state, taskId),
      }));

      const nextSessionId = get().currentSessionId;
      if (nextSessionId) {
        await get().selectSession(nextSessionId);
      } else {
        set({ chatMessages: draftChatMessages });
      }
    } catch (error) {
      set({ taskError: getErrorMessage(error) });
    }
  },
  createSession: async () => {
    const requestId = ++sessionCreationRequestSeq;
    sessionSelectionRequestSeq += 1;
    set({ isSessionLoading: true, taskError: null });

    try {
      const created = await createChatSession();
      const session = adaptChatSessionToSession(created.session);
      const messages = created.messages.map(adaptBackendChatMessage);

      if (requestId !== sessionCreationRequestSeq) {
        set((state) => ({
          sessions: upsertSession(state.sessions, session),
          chatMessagesBySession: {
            ...state.chatMessagesBySession,
            [session.id]: messages,
          },
        }));

        return session.id;
      }

      set((state) => ({
        isSessionLoading: false,
        currentSessionId: session.id,
        sessions: upsertSession(state.sessions, session),
        chatMessagesBySession: {
          ...state.chatMessagesBySession,
          [session.id]: messages,
        },
        chatMessages: messages,
        taskError: null,
        ...resetTaskView(),
      }));

      return session.id;
    } catch (error) {
      if (requestId === sessionCreationRequestSeq) {
        set({ isSessionLoading: false, taskError: getErrorMessage(error) });
      }

      return '';
    }
  },
  setActivePaper: (paperId) => set({ activePaperId: paperId }),
  setSelectedIdeas: (ideaIds) => set({ selectedIdeaIds: ideaIds }),
}));

// Auto-persist sessions + tasks + chatMessages to localStorage (debounced 2s)
useWorkspaceStore.subscribe((state) => {
  if (state.sessions.length > 0 || Object.keys(state.tasksById).length > 0) {
    schedulePersist(state);
  }
});
