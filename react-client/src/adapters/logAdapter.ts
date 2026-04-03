import type { BackendLogEntryResponse, BackendWsMessage } from '../types/backend';
import type { RunLog } from '../types/app';
import { sanitizeDisplayText } from '../utils/errorMessage';

function toRunLevel(level?: string): RunLog['level'] {
  if (level === 'warn' || level === 'warning') {
    return 'warning';
  }

  if (level === 'error' || level === 'risk') {
    return 'risk';
  }

  return 'info';
}

function formatTime(value?: string) {
  if (!value) {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(new Date());
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function buildLogFallbackMessage(log: BackendLogEntryResponse) {
  const moduleId = log.module_id || '任务';
  const step =
    log.metadata && typeof log.metadata.step === 'string' && log.metadata.step.trim()
      ? log.metadata.step.trim()
      : '';

  if (log.level === 'error') {
    return `${moduleId} 执行出错`;
  }

  if (step) {
    return `${moduleId} · ${step}`;
  }

  return `${moduleId} 状态已更新`;
}

function buildWsFallbackMessage(message: BackendWsMessage) {
  const moduleId = message.module || '任务';
  const step = typeof message.step === 'string' ? message.step.trim() : '';

  if (message.type === 'error') {
    return `${moduleId} 执行出错`;
  }

  if (message.type === 'completed') {
    return '研究任务已完成';
  }

  if (message.type === 'need_review') {
    return `${moduleId} 等待人工审阅`;
  }

  if (step) {
    return `${moduleId} · ${step}`;
  }

  return `${moduleId} 状态已更新`;
}

export function adaptLogEntry(log: BackendLogEntryResponse): RunLog {
  return {
    id: log.id,
    level: toRunLevel(log.level),
    timestamp: formatTime(log.timestamp),
    message: sanitizeDisplayText(log.message, buildLogFallbackMessage(log)),
  };
}

export function adaptLogs(logs: BackendLogEntryResponse[]) {
  return logs.map(adaptLogEntry);
}

export function adaptWsMessageToRunLog(message: BackendWsMessage): RunLog {
  return {
    id: `ws-${message.task_id}-${message.type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level: toRunLevel(message.type === 'error' ? 'error' : message.type === 'need_review' ? 'warning' : 'info'),
    timestamp: formatTime(message.timestamp),
    message: sanitizeDisplayText(message.message, buildWsFallbackMessage(message)),
  };
}
