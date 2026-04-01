import type {
  BackendArtifactContentResponse,
  BackendArtifactEntry,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const apiKey = resolveBackendAccessToken();
  const authorizationHeader = apiKey
    ? apiKey.toLowerCase().startsWith('bearer ')
      ? apiKey
      : `Bearer ${apiKey}`
    : '';

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
