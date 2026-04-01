// ============================================================
// REST API 服务层（含 Mock Fallback）
// ============================================================

import type {
  Task,
  CreateTaskRequest,
  LogEntry,
  TaskOutput,
  ReviewFeedback,
  ReviewResult,
} from '../shared/types';
import {
  DEMO_TASK,
  DEMO_TASK_RUNNING,
  DEMO_LOGS,
  DEMO_REVIEW_RESULT,
} from '../shared/mockData';

const BASE_URL = '/api';

/** 标记是否处于 Demo 模式（后端不可用时自动切换） */
let demoMode = false;

export function isDemoMode() {
  return demoMode;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  try {
    const res = await fetch(`${BASE_URL}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      ...options,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Request failed');
    }
    demoMode = false;
    return res.json();
  } catch (e) {
    // 区分网络错误和业务错误
    if (e instanceof TypeError || (e instanceof DOMException && e.name === 'AbortError')) {
      // 真正的网络/超时错误才切 demo
      demoMode = true;
    }
    throw new Error('DEMO_MODE');
  }
}

/** 创建研究任务 */
export async function createTask(data: CreateTaskRequest): Promise<Task> {
  try {
    return await request<Task>('/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  } catch {
    // Demo 模式：返回一个新的写死任务
    demoMode = true;
    const newTask: Task = {
      ...DEMO_TASK,
      id: `demo-${Date.now()}`,
      topic: data.topic,
      description: data.description,
      status: 'running',
      current_module: 'M1',
      modules: DEMO_TASK.modules.map((m, i) => ({
        ...m,
        status: i === 0 ? 'running' : 'waiting',
        percent: i === 0 ? 15 : 0,
        message: i === 0 ? '正在执行文献调研...' : '等待前置模块',
      })),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: undefined,
    };
    return newTask;
  }
}

/** 获取任务列表 */
export async function getTasks(): Promise<Task[]> {
  try {
    return await request<Task[]>('/tasks');
  } catch {
    demoMode = true;
    return [DEMO_TASK, DEMO_TASK_RUNNING];
  }
}

/** 获取任务详情 */
export async function getTask(id: string): Promise<Task> {
  try {
    return await request<Task>(`/tasks/${id}`);
  } catch {
    demoMode = true;
    if (id === DEMO_TASK_RUNNING.id) return DEMO_TASK_RUNNING;
    return DEMO_TASK;
  }
}

/** 获取任务状态 */
export async function getTaskStatus(id: string): Promise<Task> {
  return getTask(id);
}

/** 暂停任务 */
export async function pauseTask(id: string): Promise<Task> {
  try {
    return await request<Task>(`/tasks/${id}/pause`, { method: 'POST' });
  } catch {
    demoMode = true;
    return { ...DEMO_TASK_RUNNING, status: 'paused' };
  }
}

/** 恢复任务 */
export async function resumeTask(id: string): Promise<Task> {
  try {
    return await request<Task>(`/tasks/${id}/resume`, { method: 'POST' });
  } catch {
    demoMode = true;
    return { ...DEMO_TASK_RUNNING, status: 'running' };
  }
}

/** 终止任务 */
export async function abortTask(id: string): Promise<Task> {
  try {
    return await request<Task>(`/tasks/${id}/abort`, { method: 'POST' });
  } catch {
    demoMode = true;
    return { ...DEMO_TASK_RUNNING, status: 'aborted' };
  }
}

/** 删除任务 */
export async function deleteTask(id: string): Promise<void> {
  try {
    await request<void>(`/tasks/${id}`, { method: 'DELETE' });
  } catch {
    demoMode = true;
  }
}

/** 获取追溯日志 */
export async function getTaskLogs(id: string): Promise<LogEntry[]> {
  try {
    return await request<LogEntry[]>(`/tasks/${id}/logs`);
  } catch {
    demoMode = true;
    return DEMO_LOGS;
  }
}

/** 获取产出物 */
export async function getTaskOutput(id: string): Promise<TaskOutput> {
  try {
    return await request<TaskOutput>(`/tasks/${id}/output`);
  } catch {
    demoMode = true;
    return {
      paper_url: undefined,
      code_url: 'demo',
      data_url: undefined,
      figures: [],
    };
  }
}

/** 提交人工审阅反馈 */
export async function submitReview(id: string, feedback: ReviewFeedback): Promise<void> {
  try {
    return await request<void>(`/tasks/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(feedback),
    });
  } catch {
    demoMode = true;
    // Demo 模式下静默成功
  }
}

/** 获取评审结果 */
export async function getReviewResult(id: string): Promise<ReviewResult> {
  try {
    return await request<ReviewResult>(`/tasks/${id}/review-result`);
  } catch {
    demoMode = true;
    return DEMO_REVIEW_RESULT;
  }
}
