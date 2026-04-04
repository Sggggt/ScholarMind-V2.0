import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  ArtifactContent,
  ConnectionTestResult,
  LogEntry,
  NetworkMode,
  Task,
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
  return url.trim().replace(/\/+$/, "");
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

function createAbortSignal(timeoutMs = REQUEST_TIMEOUT_MS): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timeoutId),
  };
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const base = await getBackendUrl();
  if (!base) {
    throw new Error("请先在设置中配置 ScholarMind 后端地址。");
  }

  const { signal, cleanup } = createAbortSignal();

  try {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...(options?.headers ?? {}),
      },
      signal,
    });

    if (!response.ok) {
      const fallback =
        response.status === 404
          ? "请求的资源不存在。"
          : response.status >= 500
            ? "后端暂时不可用，请稍后重试。"
            : `请求失败（${response.status}）。`;
      const raw = await response.text().catch(() => "");
      throw new ApiError(raw || fallback, response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("请求超时，请检查手机与后端的网络连接。");
    }
    throw error;
  } finally {
    cleanup();
  }
}

export async function testConnection(url?: string): Promise<ConnectionTestResult> {
  const normalizedUrl = normalizeBackendUrl(url ?? (await getBackendUrl()));
  const resolvedWsUrl = normalizedUrl ? buildGlobalWsUrl(normalizedUrl) : "";
  const networkMode = normalizedUrl ? inferNetworkMode(normalizedUrl) : "unknown";

  if (!normalizedUrl) {
    return {
      normalizedUrl,
      rest: false,
      websocket: false,
      resolvedWsUrl,
      networkMode,
    };
  }

  let rest = false;
  let websocket = false;

  try {
    const { signal, cleanup } = createAbortSignal(8000);
    try {
      const response = await fetch(`${normalizedUrl}/api/tasks`, {
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

  return {
    normalizedUrl,
    rest,
    websocket,
    resolvedWsUrl,
    networkMode,
  };
}

export async function fetchTasksApi(): Promise<Task[]> {
  return apiFetch<Task[]>("/api/tasks");
}

export async function fetchTaskApi(id: string): Promise<Task> {
  return apiFetch<Task>(`/api/tasks/${id}`);
}

export async function createTaskApi(
  topic: string,
  description = "",
  config: Record<string, unknown> = {}
): Promise<Task> {
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

export async function fetchLogsApi(taskId: string, limit = 200): Promise<LogEntry[]> {
  return apiFetch<LogEntry[]>(`/api/tasks/${taskId}/logs?limit=${limit}`);
}

export async function fetchArtifactContentApi(
  taskId: string,
  path: string
): Promise<ArtifactContent> {
  return apiFetch<ArtifactContent>(
    `/api/tasks/${taskId}/artifact-content?path=${encodeURIComponent(path)}`
  );
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
