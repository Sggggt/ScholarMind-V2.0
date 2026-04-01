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
  adaptTaskToSession,
  buildDraftChatMessages,
  buildTaskCompletedMessage,
  buildTaskCreatedMessage,
  buildTaskSelectedMessage,
} from '../adapters/taskAdapter';
import type { BackendTaskResponse, BackendWsMessage } from '../types/backend';
import type { ChatMessage, RecentSession, RunLog, RunStatus, RunStep, StageId, WorkflowStage } from '../types/app';
import {
  abortTask,
  createTask,
  deleteTask,
  getTask,
  getTaskLogs,
  getTasks,
  pauseTask,
  resumeTask,
} from '../services/api';
import { buildTaskConfigOverrides, buildTaskDescription } from '../services/preferences';

interface WorkspaceState {
  isAuthenticated: boolean;
  isInitializing: boolean;
  isSubmittingTask: boolean;
  isTaskLoading: boolean;
  isLogsLoading: boolean;
  isWebSocketConnected: boolean;
  taskError: string | null;
  toastMessage: string | null;
  currentSessionId: string;
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
  activePaperId: string;
  selectedIdeaIds: string[];
  login: (email: string) => void;
  logout: () => void;
  showToast: (message: string) => void;
  clearToast: () => void;
  setWebSocketStatus: (connected: boolean) => void;
  initializeWorkspaceData: () => Promise<void>;
  refreshTask: (taskId: string) => Promise<void>;
  refreshCurrentTask: () => Promise<void>;
  refreshLogs: (taskId?: string) => Promise<void>;
  pauseCurrentTask: () => Promise<void>;
  resumeCurrentTask: () => Promise<void>;
  abortCurrentTask: () => Promise<void>;
  submitWorkspacePrompt: (topic: string) => Promise<void>;
  handleWsMessage: (message: BackendWsMessage) => void;
  openStage: (stageId: StageId) => void;
  addChatMessage: (content: string) => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  createSession: () => void;
  setActivePaper: (paperId: string) => void;
  setSelectedIdeas: (ideaIds: string[]) => void;
}

const draftChatMessages = buildDraftChatMessages();
const idleStages = buildIdleStages();
const idleRunSteps = buildIdleRunSteps();
let toastTimer: number | null = null;

function resetToastTimer() {
  if (toastTimer !== null) {
    window.clearTimeout(toastTimer);
    toastTimer = null;
  }
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return '请求失败，请稍后重试。';
}

function upsertSession(sessions: RecentSession[], nextSession: RecentSession) {
  const filtered = sessions.filter((session) => session.id !== nextSession.id);
  return [nextSession, ...filtered];
}

function applyTaskView(state: WorkspaceState, task: BackendTaskResponse) {
  const chatMessages = state.chatMessagesBySession[task.id] ?? [buildTaskSelectedMessage(task)];
  const runLogs = state.runLogsBySession[task.id] ?? [];

  return {
    currentTask: task,
    currentStage: inferCurrentStage(task),
    stages: adaptTaskToStages(task),
    runSteps: adaptTaskToRunSteps(task),
    runProgress: adaptTaskToRunProgress(task),
    runStatus: adaptTaskStatusToRunStatus(task.status),
    chatMessages,
    runLogs,
  };
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  isAuthenticated: false,
  isInitializing: false,
  isSubmittingTask: false,
  isTaskLoading: false,
  isLogsLoading: false,
  isWebSocketConnected: false,
  taskError: null,
  toastMessage: null,
  currentSessionId: '',
  currentStage: 'exploration',
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
  activePaperId: '',
  selectedIdeaIds: [],
  login: () => set({ isAuthenticated: true }),
  logout: () =>
    set({
      isAuthenticated: false,
      currentSessionId: '',
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
      isWebSocketConnected: false,
      taskError: null,
      toastMessage: null,
      activePaperId: '',
      selectedIdeaIds: [],
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
  setWebSocketStatus: (connected) => set({ isWebSocketConnected: connected }),
  initializeWorkspaceData: async () => {
    if (get().isInitializing) {
      return;
    }

    set({ isInitializing: true, taskError: null });

    try {
      const tasks = await getTasks();
      const tasksById = Object.fromEntries(tasks.map((task) => [task.id, task]));
      const sessions = tasks.map(adaptTaskToSession);
      const currentSessionId =
        get().currentSessionId && tasksById[get().currentSessionId]
          ? get().currentSessionId
          : tasks[0]?.id ?? '';

      set((state) => ({
        tasksById: { ...state.tasksById, ...tasksById },
        sessions,
        currentSessionId,
        isInitializing: false,
        ...(currentSessionId
          ? applyTaskView(state, tasksById[currentSessionId])
          : {
              currentTask: null,
              currentStage: 'exploration' as StageId,
              stages: idleStages,
              chatMessages: draftChatMessages,
              runSteps: idleRunSteps,
              runLogs: [],
              runProgress: 0,
              runStatus: 'idle' as RunStatus,
            }),
      }));
    } catch (error) {
      set({
        isInitializing: false,
        taskError: getErrorMessage(error),
      });
    }
  },
  refreshTask: async (taskId) => {
    set({ isTaskLoading: true, taskError: null });

    try {
      const task = await getTask(taskId);

      set((state) => {
        const tasksById = { ...state.tasksById, [task.id]: task };
        const sessions = upsertSession(state.sessions, adaptTaskToSession(task));

        return {
          tasksById,
          sessions,
          isTaskLoading: false,
          ...(state.currentSessionId === task.id ? applyTaskView(state, task) : {}),
        };
      });
    } catch (error) {
      set({
        isTaskLoading: false,
        taskError: getErrorMessage(error),
      });
    }
  },
  refreshCurrentTask: async () => {
    const currentSessionId = get().currentSessionId;

    if (!currentSessionId) {
      return;
    }

    await get().refreshTask(currentSessionId);
  },
  refreshLogs: async (taskId) => {
    const targetTaskId = taskId ?? get().currentSessionId;
    if (!targetTaskId) {
      return;
    }

    set({ isLogsLoading: true, taskError: null });

    try {
      const logs = adaptLogs(await getTaskLogs(targetTaskId));

      set((state) => ({
        isLogsLoading: false,
        runLogsBySession: { ...state.runLogsBySession, [targetTaskId]: logs },
        ...(state.currentSessionId === targetTaskId ? { runLogs: logs } : {}),
      }));
    } catch (error) {
      set({
        isLogsLoading: false,
        taskError: getErrorMessage(error),
      });
    }
  },
  pauseCurrentTask: async () => {
    const taskId = get().currentSessionId;
    if (!taskId) return;
    set({ isTaskLoading: true, taskError: null });
    try {
      await pauseTask(taskId);
      await get().refreshTask(taskId);
      get().showToast('任务已暂停');
    } catch (error) {
      set({ taskError: getErrorMessage(error) });
    } finally {
      set({ isTaskLoading: false });
    }
  },
  resumeCurrentTask: async () => {
    const taskId = get().currentSessionId;
    if (!taskId) return;
    set({ isTaskLoading: true, taskError: null });
    try {
      await resumeTask(taskId);
      await get().refreshTask(taskId);
      get().showToast('任务已恢复');
    } catch (error) {
      set({ taskError: getErrorMessage(error) });
    } finally {
      set({ isTaskLoading: false });
    }
  },
  abortCurrentTask: async () => {
    const taskId = get().currentSessionId;
    if (!taskId) return;
    set({ isTaskLoading: true, taskError: null });
    try {
      await abortTask(taskId);
      await get().refreshTask(taskId);
      get().showToast('任务已终止');
    } catch (error) {
      set({ taskError: getErrorMessage(error) });
    } finally {
      set({ isTaskLoading: false });
    }
  },
  submitWorkspacePrompt: async (topic) => {
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      return;
    }

    set({ isSubmittingTask: true, taskError: null });

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedTopic,
      timestamp: new Intl.DateTimeFormat('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date()),
    };

    try {
      const task = await createTask({
        topic: trimmedTopic,
        description: buildTaskDescription(trimmedTopic),
        config: buildTaskConfigOverrides(),
      });
      const assistantMessage = buildTaskCreatedMessage(task);
      const nextMessages = [userMessage, assistantMessage];

      set((state) => {
        const session = adaptTaskToSession(task);
        const chatMessagesBySession = {
          ...state.chatMessagesBySession,
          [task.id]: nextMessages,
        };
        const tasksById = { ...state.tasksById, [task.id]: task };

        return {
          isSubmittingTask: false,
          currentSessionId: task.id,
          tasksById,
          chatMessagesBySession,
          sessions: upsertSession(state.sessions, session),
          activePaperId: '',
          selectedIdeaIds: [],
          ...applyTaskView(
            {
              ...state,
              chatMessagesBySession,
              tasksById,
            },
            task,
          ),
        };
      });

      await Promise.all([get().refreshTask(task.id), get().refreshLogs(task.id)]);
    } catch (error) {
      set({
        isSubmittingTask: false,
        taskError: getErrorMessage(error),
      });
    }
  },
  handleWsMessage: (message) =>
    set((state) => {
      const nextLog = adaptWsMessageToRunLog(message);
      const existingLogs = state.runLogsBySession[message.task_id] ?? [];
      const runLogsBySession = {
        ...state.runLogsBySession,
        [message.task_id]: [...existingLogs, nextLog],
      };

      const patch: Partial<WorkspaceState> = {
        runLogsBySession,
        ...(state.currentSessionId === message.task_id ? { runLogs: runLogsBySession[message.task_id] } : {}),
      };

      if (message.type === 'error') {
        patch.taskError = message.message;
      }

      if (message.type === 'completed') {
        const task = state.tasksById[message.task_id];
        if (task) {
          const completedMessage = buildTaskCompletedMessage(task);
          const existingMessages = state.chatMessagesBySession[message.task_id] ?? [];
          const alreadyExists = existingMessages.some((entry) => entry.id === completedMessage.id);
          const nextMessages = alreadyExists ? existingMessages : [...existingMessages, completedMessage];
          patch.chatMessagesBySession = {
            ...state.chatMessagesBySession,
            [message.task_id]: nextMessages,
          };

          if (state.currentSessionId === message.task_id) {
            patch.chatMessages = nextMessages;
          }
        }
      }

      return patch;
    }),
  openStage: (stageId) => set({ currentStage: stageId }),
  addChatMessage: async (content) => {
    await get().submitWorkspacePrompt(content);
  },
  selectSession: async (sessionId) => {
    const cachedTask = get().tasksById[sessionId];

    set((state) => ({
      currentSessionId: sessionId,
      activePaperId: '',
      selectedIdeaIds: [],
      taskError: null,
      ...(cachedTask ? applyTaskView(state, cachedTask) : {}),
    }));

    await Promise.all([get().refreshTask(sessionId), get().refreshLogs(sessionId)]);
  },
  deleteSession: async (sessionId) => {
    try {
      await deleteTask(sessionId);

      set((state) => {
        const sessions = state.sessions.filter((session) => session.id !== sessionId);
        const { [sessionId]: removedTask, ...tasksById } = state.tasksById;
        const { [sessionId]: removedChat, ...chatMessagesBySession } = state.chatMessagesBySession;
        const { [sessionId]: removedLogs, ...runLogsBySession } = state.runLogsBySession;
        const deletingCurrent = state.currentSessionId === sessionId;
        const nextSessionId = deletingCurrent ? sessions[0]?.id ?? '' : state.currentSessionId;
        const nextTask = nextSessionId ? tasksById[nextSessionId] ?? null : null;

        void removedTask;
        void removedChat;
        void removedLogs;

        return {
          sessions,
          tasksById,
          chatMessagesBySession,
          runLogsBySession,
          currentSessionId: nextSessionId,
          activePaperId: '',
          selectedIdeaIds: [],
          ...(nextTask
            ? applyTaskView(
                {
                  ...state,
                  currentSessionId: nextSessionId,
                  sessions,
                  tasksById,
                  chatMessagesBySession,
                  runLogsBySession,
                },
                nextTask,
              )
            : {
                currentTask: null,
                currentStage: 'exploration' as StageId,
                stages: idleStages,
                chatMessages: draftChatMessages,
                runSteps: idleRunSteps,
                runLogs: [],
                runProgress: 0,
                runStatus: 'idle' as RunStatus,
              }),
        };
      });
    } catch (error) {
      set({ taskError: getErrorMessage(error) });
    }
  },
  createSession: () =>
    set({
      currentSessionId: '',
      currentTask: null,
      currentStage: 'exploration',
      stages: idleStages,
      chatMessages: draftChatMessages,
      runSteps: idleRunSteps,
      runLogs: [],
      runProgress: 0,
      runStatus: 'idle',
      taskError: null,
      activePaperId: '',
      selectedIdeaIds: [],
    }),
  setActivePaper: (paperId) => set({ activePaperId: paperId }),
  setSelectedIdeas: (ideaIds) => set({ selectedIdeaIds: ideaIds }),
}));
