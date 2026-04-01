import type { BackendLogEntryResponse, BackendWsMessage } from '../types/backend';
import type { RunLog } from '../types/app';

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

export function adaptLogEntry(log: BackendLogEntryResponse): RunLog {
  return {
    id: log.id,
    level: toRunLevel(log.level),
    timestamp: formatTime(log.timestamp),
    message: log.message,
  };
}

export function adaptLogs(logs: BackendLogEntryResponse[]) {
  return logs.map(adaptLogEntry);
}

export function adaptWsMessageToRunLog(message: BackendWsMessage): RunLog {
  return {
    id: `ws-${message.task_id}-${message.type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level: toRunLevel(message.type === 'error' ? 'error' : message.type === 'need_review' ? 'warning' : 'info'),
    timestamp: formatTime(),
    message: message.message,
  };
}
