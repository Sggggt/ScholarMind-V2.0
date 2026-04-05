import { createContext, useContext } from "react";
import type { ArtifactContent, LogEntry, Task, TaskIdeasState } from "./types";
import { DEFAULT_IDEAS_STATE } from "./types";

export interface TaskState {
  tasks: Task[];
  currentTaskId: string | null;
  currentTask: Task | null;
  logs: LogEntry[];
  ideas: TaskIdeasState;
  artifactContents: Record<string, ArtifactContent>;
  loading: boolean;
  error: string | null;
  wsConnected: boolean;
  syncingTaskId: string | null;
  lastSyncedAt: string | null;
}

export type TaskAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_TASKS"; payload: Task[] }
  | { type: "OPEN_TASK_CONTEXT"; payload: string }
  | { type: "SET_CURRENT_TASK"; payload: Task | null }
  | { type: "UPSERT_TASK"; payload: Task }
  | { type: "DELETE_TASK"; payload: string }
  | { type: "SET_LOGS"; payload: LogEntry[] }
  | { type: "APPEND_LOG"; payload: LogEntry }
  | { type: "SET_IDEAS"; payload: TaskIdeasState }
  | { type: "SET_ARTIFACT"; payload: { path: string; artifact: ArtifactContent | null } }
  | { type: "SET_WS_STATUS"; payload: { connected: boolean; taskId: string | null } }
  | { type: "SET_LAST_SYNC"; payload: string | null }
  | { type: "CLEAR_DETAIL_STATE" };

export const initialTaskState: TaskState = {
  tasks: [],
  currentTaskId: null,
  currentTask: null,
  logs: [],
  ideas: DEFAULT_IDEAS_STATE,
  artifactContents: {},
  loading: false,
  error: null,
  wsConnected: false,
  syncingTaskId: null,
  lastSyncedAt: null,
};

function upsertTask(tasks: Task[], nextTask: Task): Task[] {
  const existingIndex = tasks.findIndex((task) => task.id === nextTask.id);
  if (existingIndex === -1) {
    return sortTasks([nextTask, ...tasks]);
  }

  const cloned = [...tasks];
  cloned[existingIndex] = nextTask;
  return sortTasks(cloned);
}

function getTaskSortTime(task: Task): number {
  const primary = task.updated_at || task.created_at;
  const timestamp = Date.parse(primary);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => getTaskSortTime(right) - getTaskSortTime(left));
}

export function taskReducer(state: TaskState, action: TaskAction): TaskState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload, loading: false };
    case "SET_TASKS":
      return { ...state, tasks: sortTasks(action.payload), loading: false };
    case "OPEN_TASK_CONTEXT":
      if (state.currentTaskId === action.payload) {
        return state;
      }
      return {
        ...state,
        currentTaskId: action.payload,
        currentTask: null,
        logs: [],
        ideas: DEFAULT_IDEAS_STATE,
        artifactContents: {},
        error: null,
      };
    case "SET_CURRENT_TASK":
      return {
        ...state,
        currentTask: action.payload,
        currentTaskId: action.payload?.id ?? state.currentTaskId,
        tasks: action.payload ? upsertTask(state.tasks, action.payload) : state.tasks,
        loading: false,
      };
    case "UPSERT_TASK":
      return {
        ...state,
        tasks: upsertTask(state.tasks, action.payload),
        currentTask:
          state.currentTask?.id === action.payload.id ? action.payload : state.currentTask,
      };
    case "DELETE_TASK":
      return {
        ...state,
        tasks: state.tasks.filter((task) => task.id !== action.payload),
        currentTaskId: state.currentTaskId === action.payload ? null : state.currentTaskId,
        currentTask: state.currentTask?.id === action.payload ? null : state.currentTask,
        logs: state.currentTask?.id === action.payload ? [] : state.logs,
        ideas: state.currentTask?.id === action.payload ? DEFAULT_IDEAS_STATE : state.ideas,
        artifactContents: state.currentTask?.id === action.payload ? {} : state.artifactContents,
        wsConnected: state.currentTask?.id === action.payload ? false : state.wsConnected,
        syncingTaskId: state.currentTask?.id === action.payload ? null : state.syncingTaskId,
        lastSyncedAt: state.currentTask?.id === action.payload ? null : state.lastSyncedAt,
      };
    case "SET_LOGS":
      return { ...state, logs: action.payload };
    case "APPEND_LOG":
      return {
        ...state,
        logs: state.logs.some((log) => log.id === action.payload.id)
          ? state.logs
          : [...state.logs, action.payload].slice(-200),
      };
    case "SET_IDEAS":
      return { ...state, ideas: action.payload };
    case "SET_ARTIFACT": {
      const nextArtifacts = { ...state.artifactContents };
      if (action.payload.artifact) {
        nextArtifacts[action.payload.path] = action.payload.artifact;
      } else {
        delete nextArtifacts[action.payload.path];
      }
      return { ...state, artifactContents: nextArtifacts };
    }
    case "SET_WS_STATUS":
      return {
        ...state,
        wsConnected: action.payload.connected,
        syncingTaskId: action.payload.taskId,
      };
    case "SET_LAST_SYNC":
      return { ...state, lastSyncedAt: action.payload };
    case "CLEAR_DETAIL_STATE":
      return {
        ...state,
        currentTaskId: null,
        currentTask: null,
        logs: [],
        ideas: DEFAULT_IDEAS_STATE,
        artifactContents: {},
        wsConnected: false,
        syncingTaskId: null,
        lastSyncedAt: null,
      };
    default:
      return state;
  }
}

export interface TaskContextValue {
  state: TaskState;
  fetchTasks: (options?: { background?: boolean }) => Promise<void>;
  loadTaskBundle: (taskId: string, options?: { background?: boolean }) => Promise<void>;
  selectCurrentTask: (task: Task) => void;
  createTask: (
    topic: string,
    description?: string,
    config?: Record<string, unknown>
  ) => Promise<Task>;
  pauseTask: (id: string) => Promise<void>;
  resumeTask: (id: string) => Promise<void>;
  abortTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  fetchIdeas: (taskId: string) => Promise<void>;
  continueIdeas: (taskId: string) => Promise<void>;
  selectIdea: (taskId: string, ideaIndex: number) => Promise<void>;
  startTaskSync: (taskId: string) => Promise<void>;
  stopTaskSync: () => void;
}

export const TaskContext = createContext<TaskContextValue | null>(null);

export function useTaskContext(): TaskContextValue {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useTaskContext must be used within TaskProvider");
  return ctx;
}
