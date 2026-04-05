import { useCallback, useEffect, useReducer, useRef, type ReactNode } from "react";
import { AppState } from "react-native";
import {
  ApiError,
  abortTaskApi,
  continueIdeasApi,
  createTaskApi,
  deleteTaskApi,
  fetchArtifactContentApi,
  fetchIdeasApi,
  fetchLogsApi,
  fetchTaskApi,
  fetchTasksApi,
  getBackendUrl,
  pauseTaskApi,
  resumeTaskApi,
  selectIdeaApi,
} from "./api";
import {
  normalizeIdea,
  shouldLoadIdeas,
  shouldLoadM1Artifacts,
  shouldLoadM2Artifacts,
  shouldLoadM4Artifacts,
  shouldLoadM5Artifacts,
  toWsLogEntry,
} from "./task-helpers";
import { TaskContext, initialTaskState, taskReducer } from "./task-store";
import { buildTaskWsUrl, subscribeTaskWebSocket } from "./websocket";
import type { Task, TaskIdeasState } from "./types";
import { DEFAULT_IDEAS_STATE } from "./types";

type SyncHandle = {
  taskId: string;
  unsubscribe: () => void;
};

export function TaskProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(taskReducer, initialTaskState);
  const syncRef = useRef<SyncHandle | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const fetchTasks = useCallback(async (options?: { background?: boolean }) => {
    if (!options?.background) {
      dispatch({ type: "SET_LOADING", payload: true });
      dispatch({ type: "SET_ERROR", payload: null });
    }

    try {
      const tasks = await fetchTasksApi();
      dispatch({ type: "SET_TASKS", payload: tasks });
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        payload: error instanceof Error ? error.message : "任务列表加载失败。",
      });
    }
  }, []);

  const fetchArtifact = useCallback(async (taskId: string, path: string) => {
    try {
      const artifact = await fetchArtifactContentApi(taskId, path);
      dispatch({ type: "SET_ARTIFACT", payload: { path, artifact } });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        dispatch({ type: "SET_ARTIFACT", payload: { path, artifact: null } });
        return;
      }
      throw error;
    }
  }, []);

  const fetchIdeas = useCallback(async (taskId: string) => {
    try {
      const baseIdeas = await fetchIdeasApi(taskId);

      try {
        const scoredIdeasArtifact = await fetchArtifactContentApi(taskId, "m3_scored_ideas.json");
        const payload =
          scoredIdeasArtifact.content && typeof scoredIdeasArtifact.content === "object"
            ? (scoredIdeasArtifact.content as Record<string, unknown>)
            : {};
        const rawIdeas = Array.isArray(payload.scored_ideas) ? payload.scored_ideas : [];
        const bestIdeaIndex =
          typeof payload.best_idea_index === "number"
            ? payload.best_idea_index
            : baseIdeas.bestIdeaIndex;
        const ideas = rawIdeas.map((idea, index) =>
          normalizeIdea(idea as Record<string, unknown>, index, index === bestIdeaIndex)
        );

        const nextIdeasState: TaskIdeasState = {
          ...baseIdeas,
          ideas,
          totalGenerated:
            typeof payload.total_generated === "number"
              ? payload.total_generated
              : baseIdeas.totalGenerated,
          bestIdeaIndex,
          status: baseIdeas.status === "ready" || ideas.length > 0 ? "ready" : baseIdeas.status,
        };

        dispatch({ type: "SET_IDEAS", payload: nextIdeasState });
        return;
      } catch {
        dispatch({ type: "SET_IDEAS", payload: baseIdeas });
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        dispatch({ type: "SET_IDEAS", payload: DEFAULT_IDEAS_STATE });
        return;
      }
      dispatch({
        type: "SET_ERROR",
        payload: error instanceof Error ? error.message : "Idea 列表加载失败。",
      });
    }
  }, []);

  const loadTaskBundle = useCallback(
    async (taskId: string, options?: { background?: boolean }) => {
      dispatch({ type: "OPEN_TASK_CONTEXT", payload: taskId });

      if (!options?.background) {
        dispatch({ type: "SET_LOADING", payload: true });
        dispatch({ type: "SET_ERROR", payload: null });
      }

      try {
        const [task, logs] = await Promise.all([fetchTaskApi(taskId), fetchLogsApi(taskId)]);

        dispatch({ type: "SET_CURRENT_TASK", payload: task });
        dispatch({ type: "SET_LOGS", payload: logs });
        dispatch({ type: "SET_LAST_SYNC", payload: new Date().toISOString() });

        const jobs: Promise<unknown>[] = [];

        if (shouldLoadM1Artifacts(task)) {
          jobs.push(fetchArtifact(taskId, "m1_literature_review.md"));
          jobs.push(fetchArtifact(taskId, "m1_sources.json"));
        }

        if (shouldLoadM2Artifacts(task)) {
          jobs.push(fetchArtifact(taskId, "m2_gap_analysis.json"));
        }

        if (shouldLoadM4Artifacts(task)) {
          jobs.push(fetchArtifact(taskId, "m4_code_gen_info.json"));
        }

        if (shouldLoadM5Artifacts(task)) {
          jobs.push(fetchArtifact(taskId, "m5_experiment_plan.json"));
        }

        if (shouldLoadIdeas(task)) {
          jobs.push(fetchIdeas(taskId));
        }

        await Promise.allSettled(jobs);
      } catch (error) {
        dispatch({
          type: "SET_ERROR",
          payload: error instanceof Error ? error.message : "任务详情加载失败。",
        });
      } finally {
        if (!options?.background) {
          dispatch({ type: "SET_LOADING", payload: false });
        }
      }
    },
    [fetchArtifact, fetchIdeas]
  );

  const scheduleBackgroundRefresh = useCallback(
    (taskId: string, delay = 1200) => {
      clearRefreshTimer();
      refreshTimerRef.current = setTimeout(() => {
        void loadTaskBundle(taskId, { background: true });
      }, delay);
    },
    [clearRefreshTimer, loadTaskBundle]
  );

  const ensurePolling = useCallback(
    (taskId: string) => {
      clearPolling();
      pollTimerRef.current = setInterval(() => {
        void loadTaskBundle(taskId, { background: true });
      }, 5000);
    },
    [clearPolling, loadTaskBundle]
  );

  const stopTaskSync = useCallback(() => {
    clearPolling();
    clearRefreshTimer();

    if (syncRef.current) {
      syncRef.current.unsubscribe();
      syncRef.current = null;
    }

    dispatch({ type: "SET_WS_STATUS", payload: { connected: false, taskId: null } });
  }, [clearPolling, clearRefreshTimer]);

  const startTaskSync = useCallback(
    async (taskId: string) => {
      await loadTaskBundle(taskId);

      if (syncRef.current?.taskId === taskId) {
        return;
      }

      stopTaskSync();

      const baseUrl = await getBackendUrl();
      if (!baseUrl) return;

      const wsUrl = buildTaskWsUrl(baseUrl, taskId);

      const unsubscribe = subscribeTaskWebSocket(wsUrl, {
        onMessage: (message) => {
          dispatch({ type: "APPEND_LOG", payload: toWsLogEntry(message) });
          dispatch({ type: "SET_WS_STATUS", payload: { connected: true, taskId } });

          if (
            message.type === "completed" ||
            message.type === "error" ||
            message.type === "need_review"
          ) {
            void loadTaskBundle(taskId, { background: true });
            return;
          }

          scheduleBackgroundRefresh(taskId, message.module === "M3" ? 600 : 1200);
        },
        onOpen: () => {
          clearPolling();
          dispatch({ type: "SET_WS_STATUS", payload: { connected: true, taskId } });
        },
        onClose: () => {
          dispatch({ type: "SET_WS_STATUS", payload: { connected: false, taskId } });
          ensurePolling(taskId);
        },
        onError: () => {
          dispatch({ type: "SET_WS_STATUS", payload: { connected: false, taskId } });
          ensurePolling(taskId);
        },
      });

      syncRef.current = { taskId, unsubscribe };
    },
    [clearPolling, ensurePolling, loadTaskBundle, scheduleBackgroundRefresh, stopTaskSync]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const activeTaskId = syncRef.current?.taskId;
      if (!activeTaskId) return;

      if (nextState === "active") {
        void loadTaskBundle(activeTaskId, { background: true });
      }
    });

    return () => subscription.remove();
  }, [loadTaskBundle]);

  const createTask = useCallback(
    async (topic: string, description = "", config: Record<string, unknown> = {}) => {
      const task = await createTaskApi(topic, description, config);
      dispatch({ type: "UPSERT_TASK", payload: task });
      dispatch({ type: "SET_CURRENT_TASK", payload: task });
      return task;
    },
    []
  );

  const selectCurrentTask = useCallback((task: Task) => {
    dispatch({ type: "OPEN_TASK_CONTEXT", payload: task.id });
    dispatch({ type: "SET_CURRENT_TASK", payload: task });
  }, []);

  const pauseTask = useCallback(async (id: string) => {
    const task = await pauseTaskApi(id);
    dispatch({ type: "UPSERT_TASK", payload: task });
    dispatch({ type: "SET_CURRENT_TASK", payload: task });
  }, []);

  const resumeTask = useCallback(async (id: string) => {
    const task = await resumeTaskApi(id);
    dispatch({ type: "UPSERT_TASK", payload: task });
    dispatch({ type: "SET_CURRENT_TASK", payload: task });
  }, []);

  const abortTask = useCallback(async (id: string) => {
    const task = await abortTaskApi(id);
    dispatch({ type: "UPSERT_TASK", payload: task });
    dispatch({ type: "SET_CURRENT_TASK", payload: task });
  }, []);

  const deleteTask = useCallback(
    async (id: string) => {
      if (syncRef.current?.taskId === id) {
        stopTaskSync();
      }
      await deleteTaskApi(id);
      dispatch({ type: "DELETE_TASK", payload: id });
    },
    [stopTaskSync]
  );

  const continueIdeas = useCallback(
    async (taskId: string) => {
      const task = await continueIdeasApi(taskId);
      dispatch({ type: "UPSERT_TASK", payload: task });
      dispatch({ type: "SET_CURRENT_TASK", payload: task });
      await fetchIdeas(taskId);
    },
    [fetchIdeas]
  );

  const selectIdea = useCallback(
    async (taskId: string, ideaIndex: number) => {
      const task = await selectIdeaApi(taskId, ideaIndex);
      dispatch({ type: "UPSERT_TASK", payload: task });
      dispatch({ type: "SET_CURRENT_TASK", payload: task });
      await loadTaskBundle(taskId, { background: true });
    },
    [loadTaskBundle]
  );

  return (
    <TaskContext.Provider
      value={{
        state,
        fetchTasks,
        loadTaskBundle,
        selectCurrentTask,
        createTask,
        pauseTask,
        resumeTask,
        abortTask,
        deleteTask,
        fetchIdeas,
        continueIdeas,
        selectIdea,
        startTaskSync,
        stopTaskSync,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
}
