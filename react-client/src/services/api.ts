import type {
  BackendArtifactContentResponse,
  BackendArtifactEntry,
  BackendChatMessageCreateRequest,
  BackendChatMessageSendResponse,
  BackendChatSessionDetailResponse,
  BackendChatSessionResponse,
  BackendLogEntryResponse,
  BackendRepoFileResponse,
  BackendRepoTreeNode,
  BackendRuntimeSettingsRequest,
  BackendRuntimeSettingsResponse,
  BackendSshStatusResponse,
  BackendSshTestResponse,
  BackendReviewReportResponse,
  BackendReviewResultResponse,
  BackendTaskCreateRequest,
  BackendTaskOutputResponse,
  BackendTaskResponse,
} from '../types/backend';
import { resolveApiBase, resolveBackendAccessToken } from './preferences';

const REQUEST_TIMEOUT_MS = 20000;
const responseCache = new Map<string, unknown>();
const pendingRequestCache = new Map<string, Promise<unknown>>();

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function buildUrl(path: string) {
  const apiBase = resolveApiBase(import.meta.env.VITE_API_BASE as string | undefined);
  return `${apiBase}${path}`;
}

function buildRequestCacheKey(path: string, method: string, authorizationHeader: string) {
  return `${method.toUpperCase()}::${buildUrl(path)}::${authorizationHeader}`;
}

function clearResolvedApiCache(predicate?: (key: string) => boolean) {
  for (const key of responseCache.keys()) {
    if (!predicate || predicate(key)) {
      responseCache.delete(key);
    }
  }

  for (const key of pendingRequestCache.keys()) {
    if (!predicate || predicate(key)) {
      pendingRequestCache.delete(key);
    }
  }
}

export function clearApiCache() {
  clearResolvedApiCache();
}

export function clearTaskApiCache(taskId: string) {
  if (!taskId) {
    return;
  }

  clearResolvedApiCache((key) => key.includes(`/tasks/${taskId}`) || key.includes(`/files/${taskId}/`));
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = resolveBackendAccessToken();
  const authorizationHeader = apiKey
    ? apiKey.toLowerCase().startsWith('bearer ')
      ? apiKey
      : `Bearer ${apiKey}`
    : '';
  const method = (init?.method ?? 'GET').toUpperCase();
  const shouldCache = method === 'GET' && !init?.body;
  const cacheKey = shouldCache ? buildRequestCacheKey(path, method, authorizationHeader) : '';

  if (cacheKey && responseCache.has(cacheKey)) {
    return responseCache.get(cacheKey) as T;
  }

  if (cacheKey && pendingRequestCache.has(cacheKey)) {
    return (await pendingRequestCache.get(cacheKey)) as T;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const fetchRequest = (async () => {
    try {
      const response = await fetch(buildUrl(path), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(authorizationHeader ? { Authorization: authorizationHeader } : {}),
          ...(init?.headers ?? {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ApiError(errorText || `Request failed with status ${response.status}`, response.status);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        return (await response.json()) as T;
      }

      return (await response.text()) as T;
    } finally {
      window.clearTimeout(timeoutId);
    }
  })();

  if (cacheKey) {
    pendingRequestCache.set(cacheKey, fetchRequest);
  }

  try {
    const result = await fetchRequest;

    if (cacheKey) {
      responseCache.set(cacheKey, result);
    } else {
      clearResolvedApiCache();
    }

    return result;
  } finally {
    if (cacheKey) {
      pendingRequestCache.delete(cacheKey);
    }
  }
}

async function requestOptional<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    return await request<T>(path, init);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

export function getApiBase() {
  return resolveApiBase(import.meta.env.VITE_API_BASE as string | undefined);
}

export async function createTask(payload: BackendTaskCreateRequest) {
  return request<BackendTaskResponse>('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      topic: payload.topic,
      description: payload.description ?? '',
      config: payload.config ?? {},
    }),
  });
}

export async function getChatSessions() {
  return request<BackendChatSessionResponse[]>('/chat/sessions');
}

export async function createChatSession(title = '') {
  return request<BackendChatSessionDetailResponse>('/chat/sessions', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
}

export async function getChatSession(sessionId: string) {
  return request<BackendChatSessionDetailResponse>(`/chat/sessions/${sessionId}`);
}

export async function sendChatMessage(sessionId: string, payload: BackendChatMessageCreateRequest) {
  return request<BackendChatMessageSendResponse>(`/chat/sessions/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: payload.content,
      task_description: payload.task_description ?? '',
      task_config: payload.task_config ?? {},
    }),
  });
}

export async function deleteChatSession(sessionId: string) {
  return request<{ ok: boolean }>(`/chat/sessions/${sessionId}`, { method: 'DELETE' });
}

export async function getRuntimeSettings() {
  return request<BackendRuntimeSettingsResponse>('/settings/runtime');
}

export async function saveRuntimeSettings(payload: BackendRuntimeSettingsRequest) {
  return request<BackendRuntimeSettingsResponse>('/settings/runtime', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function getTasks(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<BackendTaskResponse[]>(`/tasks${query}`);
}

export async function getTask(taskId: string) {
  return request<BackendTaskResponse>(`/tasks/${taskId}`);
}

export async function pauseTask(taskId: string) {
  return request<BackendTaskResponse>(`/tasks/${taskId}/pause`, { method: 'POST' });
}

export async function resumeTask(taskId: string) {
  return request<BackendTaskResponse>(`/tasks/${taskId}/resume`, { method: 'POST' });
}

export async function abortTask(taskId: string) {
  return request<BackendTaskResponse>(`/tasks/${taskId}/abort`, { method: 'POST' });
}

export async function restartTask(taskId: string) {
  return requestOptional<BackendTaskResponse>(`/tasks/${taskId}/restart`, { method: 'POST' });
}

export async function resetTaskModule(taskId: string, moduleId: string) {
  return requestOptional<BackendTaskResponse>(`/tasks/${taskId}/reset-module`, {
    method: 'POST',
    body: JSON.stringify({ module_id: moduleId }),
  });
}

export async function deleteTask(taskId: string) {
  return request<{ ok: boolean }>(`/tasks/${taskId}`, { method: 'DELETE' });
}

export async function getTaskLogs(taskId: string, limit = 200) {
  return request<BackendLogEntryResponse[]>(`/tasks/${taskId}/logs?limit=${limit}`);
}

export async function getTaskOutput(taskId: string) {
  return request<BackendTaskOutputResponse>(`/tasks/${taskId}/output`);
}

export async function getReviewResult(taskId: string) {
  return request<BackendReviewResultResponse>(`/tasks/${taskId}/review-result`);
}

export async function getArtifactContent(taskId: string, path: string) {
  const encodedPath = encodeURIComponent(path);
  return request<BackendArtifactContentResponse>(`/tasks/${taskId}/artifact-content?path=${encodedPath}`);
}

export async function getArtifacts(taskId: string) {
  return request<BackendArtifactEntry[]>(`/tasks/${taskId}/artifacts`);
}

export async function getRepoTree(taskId: string) {
  return request<BackendRepoTreeNode[]>(`/tasks/${taskId}/repo/tree`);
}

export async function getRepoFile(taskId: string, path: string) {
  const encodedPath = encodeURIComponent(path);
  return request<BackendRepoFileResponse>(`/tasks/${taskId}/repo/file?path=${encodedPath}`);
}

export async function getReviewReport(taskId: string) {
  return request<BackendReviewReportResponse>(`/tasks/${taskId}/review-report`);
}

export async function getSshStatus() {
  return request<BackendSshStatusResponse>('/ssh/status');
}

export async function testSshConnection() {
  return request<BackendSshTestResponse>('/ssh/test', { method: 'POST' });
}

export async function testBackendConnection() {
  return request<BackendTaskResponse[]>('/tasks');
}
