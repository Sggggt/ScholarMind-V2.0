// ============================================================
// Zustand 全局状态管理
// ============================================================

import { create } from 'zustand';
import type {
  Task,
  LogEntry,
  WsMessage,
  ModuleId,
  ReviewResult,
} from '../shared/types';
import { MODULE_NAMES } from '../shared/types';
import * as api from '../services/api';
import { useToastStore } from './toastStore';
import { useNotificationStore } from './notificationStore';

interface TaskState {
  // 数据
  tasks: Task[];
  currentTaskId: string | null;
  logs: LogEntry[];
  reviewResult: ReviewResult | null;
  needReviewData: { taskId: string; module: ModuleId; content: unknown } | null;

  // UI 状态
  sidebarOpen: boolean;
  loading: boolean;
  error: string | null;

  // Actions
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setCurrentTaskId: (id: string | null) => void;
  setError: (error: string | null) => void;
  clearNeedReview: () => void;

  // API Actions
  fetchTasks: () => Promise<void>;
  fetchTask: (id: string) => Promise<void>;
  createTask: (topic: string, description?: string) => Promise<Task>;
  pauseTask: (id: string) => Promise<void>;
  resumeTask: (id: string) => Promise<void>;
  abortTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  fetchLogs: (id: string) => Promise<void>;
  fetchReviewResult: (id: string) => Promise<void>;
  submitReview: (id: string, action: 'approve' | 'reject' | 'revise', comment?: string) => Promise<void>;

  // WebSocket handler
  handleWsMessage: (msg: WsMessage) => void;
}

function showError(message: string) {
  useToastStore.getState().addToast('error', message);
}

function notify(type: 'info' | 'success' | 'warning' | 'error', title: string, message: string, taskId?: string, module?: string) {
  useNotificationStore.getState().addNotification(type, title, message, taskId, module);
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  currentTaskId: null,
  logs: [],
  reviewResult: null,
  needReviewData: null,
  sidebarOpen: true,
  loading: false,
  error: null,

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setCurrentTaskId: (id) => set({ currentTaskId: id, logs: [], reviewResult: null }),
  setError: (error) => set({ error }),
  clearNeedReview: () => set({ needReviewData: null }),

  fetchTasks: async () => {
    set({ loading: true, error: null });
    try {
      const tasks = await api.getTasks();
      set({ tasks, loading: false });
    } catch {
      // Demo 模式下不显示错误（api.ts 已经返回了 mock 数据）
      set({ loading: false });
    }
  },

  fetchTask: async (id) => {
    try {
      const task = await api.getTask(id);
      set((s) => {
        const exists = s.tasks.some((t) => t.id === id);
        return {
          tasks: exists
            ? s.tasks.map((t) => (t.id === id ? task : t))
            : [...s.tasks, task],
        };
      });
    } catch {
      // 静默处理 Demo 模式
    }
  },

  createTask: async (topic, description) => {
    set({ loading: true, error: null });
    try {
      const task = await api.createTask({ topic, description });
      set((s) => ({
        tasks: [task, ...s.tasks],
        currentTaskId: task.id,
        loading: false,
      }));
      notify('success', '任务已创建', topic, task.id);
      return task;
    } catch (e: unknown) {
      const msg = (e as Error).message;
      set({ loading: false, error: msg });
      showError(`创建任务失败: ${msg}`);
      throw e;
    }
  },

  pauseTask: async (id) => {
    try {
      const task = await api.pauseTask(id);
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? task : t)),
      }));
    } catch {
      // 静默处理
    }
  },

  resumeTask: async (id) => {
    try {
      const task = await api.resumeTask(id);
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? task : t)),
      }));
    } catch {
      // 静默处理
    }
  },

  abortTask: async (id) => {
    try {
      const task = await api.abortTask(id);
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === id ? task : t)),
      }));
    } catch {
      // 静默处理
    }
  },

  deleteTask: async (id) => {
    try {
      await api.deleteTask(id);
      set((s) => ({
        tasks: s.tasks.filter((t) => t.id !== id),
        currentTaskId: s.currentTaskId === id ? null : s.currentTaskId,
      }));
    } catch {
      // 静默处理 — Demo 模式下仍从本地列表移除
      set((s) => ({
        tasks: s.tasks.filter((t) => t.id !== id),
        currentTaskId: s.currentTaskId === id ? null : s.currentTaskId,
      }));
    }
  },

  fetchLogs: async (id) => {
    try {
      const logs = await api.getTaskLogs(id);
      set({ logs });
    } catch {
      // 静默处理
    }
  },

  fetchReviewResult: async (id) => {
    try {
      const reviewResult = await api.getReviewResult(id);
      set({ reviewResult });
    } catch {
      // 静默处理
    }
  },

  submitReview: async (id, action, comment) => {
    try {
      await api.submitReview(id, { action, comment });
      set({ needReviewData: null });
      useToastStore.getState().addToast('success', '审阅已提交');
    } catch (e: unknown) {
      const msg = (e as Error).message;
      set({ error: msg });
      showError(`提交审阅失败: ${msg}`);
    }
  },

  handleWsMessage: (msg) => {
    const { currentTaskId } = get();

    switch (msg.type) {
      case 'progress': {
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== msg.task_id) return t;
            return {
              ...t,
              status: 'running',
              current_module: msg.module,
              modules: t.modules.map((m) =>
                m.module_id === msg.module
                  ? { ...m, status: 'running', percent: msg.percent, step: msg.step, message: msg.message }
                  : m
              ),
            };
          }),
        }));
        if (msg.task_id === currentTaskId) {
          set((s) => ({
            logs: [
              ...s.logs,
              {
                id: `${Date.now()}`,
                task_id: msg.task_id,
                module_id: msg.module,
                level: 'info',
                message: `[${msg.module}] ${msg.message}`,
                timestamp: new Date().toISOString(),
              },
            ],
          }));
        }
        break;
      }
      case 'result': {
        const moduleName = MODULE_NAMES[msg.module] || msg.module;
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== msg.task_id) return t;
            return {
              ...t,
              modules: t.modules.map((m) =>
                m.module_id === msg.module
                  ? { ...m, status: 'completed', percent: 100 }
                  : m
              ),
            };
          }),
        }));
        notify('success', `${moduleName} 完成`, `模块 ${msg.module} 已完成执行`, msg.task_id, msg.module);
        break;
      }
      case 'need_review': {
        const moduleName = MODULE_NAMES[msg.module] || msg.module;
        set({
          needReviewData: {
            taskId: msg.task_id,
            module: msg.module,
            content: msg.content,
          },
        });
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === msg.task_id ? { ...t, status: 'review' } : t
          ),
        }));
        useToastStore.getState().addToast('warning', '有任务需要人工审阅');
        notify('warning', '需要人工审阅', `${moduleName} 模块产出需要您的确认`, msg.task_id, msg.module);
        break;
      }
      case 'error': {
        const moduleName = MODULE_NAMES[msg.module] || msg.module;
        set((s) => ({
          tasks: s.tasks.map((t) => {
            if (t.id !== msg.task_id) return t;
            return {
              ...t,
              status: 'failed',
              modules: t.modules.map((m) =>
                m.module_id === msg.module
                  ? { ...m, status: 'failed', message: msg.error }
                  : m
              ),
            };
          }),
        }));
        showError(`任务执行出错: ${msg.error}`);
        notify('error', `${moduleName} 执行失败`, msg.error, msg.task_id, msg.module);
        break;
      }
      case 'completed': {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === msg.task_id
              ? { ...t, status: 'completed', output_url: msg.output_url }
              : t
          ),
        }));
        useToastStore.getState().addToast('success', '研究任务已完成');
        notify('success', '研究任务完成', '全部模块已执行完毕，可查看产出物', msg.task_id);
        break;
      }
    }
  },
}));
