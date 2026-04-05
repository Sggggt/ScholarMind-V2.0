import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  ArtifactContent,
  ChatMessageSendResponse,
  ChatSession,
  ChatSessionDetail,
  ConnectionInfo,
  ConnectionTestResult,
  LogEntry,
  NetworkMode,
  RepoTreeNode,
  ReviewReport,
  Task,
  TaskOutput,
  TaskIdeasState,
} from "./types";
import { DEFAULT_IDEAS_STATE } from "./types";
import { buildGlobalWsUrl, probeWebSocket } from "./websocket";

const BACKEND_URL_KEY = "scholarmind_backend_url";
const RESOLVED_WS_URL_KEY = "scholarmind_resolved_ws_url";
const NETWORK_MODE_KEY = "scholarmind_network_mode";
const REQUEST_TIMEOUT_MS = 15000;

let cachedUrl: string | null = null;
let cachedWsUrl: string | null = null;
let cachedNetworkMode: NetworkMode | null = null;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function normalizeBackendUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").replace(/\/api$/i, "");
}

function getHostname(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isPrivateIpv4(hostname: string): boolean {
  return (
    /^10\./.test(hostname) ||
    /^127\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

export function inferNetworkMode(url: string): NetworkMode {
  const hostname = getHostname(url);
  if (!hostname) return "unknown";
  if (hostname === "localhost" || hostname === "127.0.0.1" || isPrivateIpv4(hostname)) {
    return "lan";
  }
  return "public";
}

export async function getBackendUrl(): Promise<string> {
  if (cachedUrl !== null) return cachedUrl;
  cachedUrl = (await AsyncStorage.getItem(BACKEND_URL_KEY)) ?? "";
  return cachedUrl;
}

export async function getResolvedWsUrl(): Promise<string> {
  if (cachedWsUrl !== null) return cachedWsUrl;
  cachedWsUrl = (await AsyncStorage.getItem(RESOLVED_WS_URL_KEY)) ?? "";
  return cachedWsUrl;
}

export async function getNetworkMode(): Promise<NetworkMode> {
  if (cachedNetworkMode !== null) return cachedNetworkMode;
  const stored = await AsyncStorage.getItem(NETWORK_MODE_KEY);
  cachedNetworkMode = (stored as NetworkMode | null) ?? "unknown";
  return cachedNetworkMode;
}

export async function setBackendUrl(url: string): Promise<void> {
  const normalizedUrl = normalizeBackendUrl(url);
  const resolvedWsUrl = normalizedUrl ? buildGlobalWsUrl(normalizedUrl) : "";
  const networkMode = normalizedUrl ? inferNetworkMode(normalizedUrl) : "unknown";

  cachedUrl = normalizedUrl;
  cachedWsUrl = resolvedWsUrl;
  cachedNetworkMode = networkMode;

  await AsyncStorage.multiSet([
    [BACKEND_URL_KEY, normalizedUrl],
    [RESOLVED_WS_URL_KEY, resolvedWsUrl],
    [NETWORK_MODE_KEY, networkMode],
  ]);
}

function createAbortSignal(timeoutMs = REQUEST_TIMEOUT_MS): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

async function fetchJsonFromBase<T>(baseUrl: string, path: string, options?: RequestInit): Promise<T> {
  const normalizedUrl = normalizeBackendUrl(baseUrl);
  if (!normalizedUrl) {
    throw new Error("Please configure the ScholarMind backend URL first.");
  }

  const { signal, cleanup } = createAbortSignal();

  try {
    const response = await fetch(`${normalizedUrl}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...(options?.headers ?? {}),
      },
      signal,
    });

    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      throw new ApiError(raw || `Request failed (${response.status})`, response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Request timed out. Check that the phone can reach the backend.");
    }
    throw error;
  } finally {
    cleanup();
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  return fetchJsonFromBase<T>(await getBackendUrl(), path, options);
}

export async function testConnection(url?: string): Promise<ConnectionTestResult> {
  const normalizedUrl = normalizeBackendUrl(url ?? (await getBackendUrl()));
  const resolvedWsUrl = normalizedUrl ? buildGlobalWsUrl(normalizedUrl) : "";
  const networkMode = normalizedUrl ? inferNetworkMode(normalizedUrl) : "unknown";

  if (!normalizedUrl) {
    return { normalizedUrl, rest: false, websocket: false, resolvedWsUrl, networkMode };
  }

  let rest = false;
  let websocket = false;

  try {
    const { signal, cleanup } = createAbortSignal(8000);
    try {
      const response = await fetch(`${normalizedUrl}/api/health`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal,
      });
      rest = response.ok;
    } finally {
      cleanup();
    }
  } catch {
    rest = false;
  }

  if (rest && resolvedWsUrl) {
    websocket = await probeWebSocket(resolvedWsUrl, 5000);
  }

  return { normalizedUrl, rest, websocket, resolvedWsUrl, networkMode };
}

export async function fetchConnectionInfo(url?: string): Promise<ConnectionInfo> {
  return fetchJsonFromBase<ConnectionInfo>(url ?? (await getBackendUrl()), "/api/connection-info");
}

export async function fetchChatSessionsApi(): Promise<ChatSession[]> {
  return apiFetch<ChatSession[]>("/api/chat/sessions");
}

export async function createChatSessionApi(title = ""): Promise<ChatSessionDetail> {
  return apiFetch<ChatSessionDetail>("/api/chat/sessions", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
}

export async function fetchChatSessionApi(sessionId: string): Promise<ChatSessionDetail> {
  return apiFetch<ChatSessionDetail>(`/api/chat/sessions/${sessionId}`);
}

export async function bindChatSessionTaskApi(sessionId: string, taskId: string): Promise<ChatSessionDetail> {
  return apiFetch<ChatSessionDetail>(`/api/chat/sessions/${sessionId}/bind-task`, {
    method: "POST",
    body: JSON.stringify({ task_id: taskId }),
  });
}

export async function sendChatMessageApi(
  sessionId: string,
  payload: { content: string; task_description?: string; task_config?: Record<string, unknown> }
): Promise<ChatMessageSendResponse> {
  return apiFetch<ChatMessageSendResponse>(`/api/chat/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: payload.content,
      task_description: payload.task_description ?? "",
      task_config: payload.task_config ?? {},
    }),
  });
}

export async function fetchTasksApi(): Promise<Task[]> {
  return apiFetch<Task[]>("/api/tasks");
}

export async function fetchTaskApi(id: string): Promise<Task> {
  return apiFetch<Task>(`/api/tasks/${id}`);
}

export async function createTaskApi(topic: string, description = "", config: Record<string, unknown> = {}): Promise<Task> {
  return apiFetch<Task>("/api/tasks", {
    method: "POST",
    body: JSON.stringify({ topic, description, config }),
  });
}

export async function pauseTaskApi(id: string): Promise<Task> {
  return apiFetch<Task>(`/api/tasks/${id}/pause`, { method: "POST" });
}

export async function resumeTaskApi(id: string): Promise<Task> {
  return apiFetch<Task>(`/api/tasks/${id}/resume`, { method: "POST" });
}

export async function abortTaskApi(id: string): Promise<Task> {
  return apiFetch<Task>(`/api/tasks/${id}/abort`, { method: "POST" });
}

export async function deleteTaskApi(id: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/api/tasks/${id}`, { method: "DELETE" });
}

export async function fetchLogsApi(taskId: string, limit = 200): Promise<LogEntry[]> {
  return apiFetch<LogEntry[]>(`/api/tasks/${taskId}/logs?limit=${limit}`);
}

export async function fetchArtifactContentApi(taskId: string, path: string): Promise<ArtifactContent> {
  return apiFetch<ArtifactContent>(`/api/tasks/${taskId}/artifact-content?path=${encodeURIComponent(path)}`);
}

export async function fetchRepoTreeApi(taskId: string): Promise<RepoTreeNode[]> {
  return apiFetch<RepoTreeNode[]>(`/api/tasks/${taskId}/repo/tree`);
}

export async function fetchTaskOutputApi(taskId: string): Promise<TaskOutput> {
  return apiFetch<TaskOutput>(`/api/tasks/${taskId}/output`);
}

export async function fetchReviewReportApi(taskId: string): Promise<ReviewReport> {
  return apiFetch<ReviewReport>(`/api/tasks/${taskId}/review-report`);
}

export async function fetchIdeasApi(taskId: string): Promise<TaskIdeasState> {
  const response = await apiFetch<{
    best_idea_index?: number;
    total_generated?: number;
    status?: TaskIdeasState["status"];
    message?: string;
  }>(`/api/tasks/${taskId}/ideas`);

  return {
    ...DEFAULT_IDEAS_STATE,
    status: response.status ?? "not_started",
    totalGenerated: response.total_generated ?? 0,
    bestIdeaIndex: response.best_idea_index ?? 0,
    message: response.message ?? "",
  };
}

export async function continueIdeasApi(taskId: string): Promise<Task> {
  const response = await apiFetch<{ task?: Task }>(`/api/tasks/${taskId}/continue-ideas`, {
    method: "POST",
  });
  return response.task ?? fetchTaskApi(taskId);
}

export async function selectIdeaApi(taskId: string, ideaIndex: number): Promise<Task> {
  const response = await apiFetch<{ task?: Task }>(`/api/tasks/${taskId}/select-idea`, {
    method: "POST",
    body: JSON.stringify({ idea_index: ideaIndex, replace_existing: false }),
  });
  return response.task ?? fetchTaskApi(taskId);
}
