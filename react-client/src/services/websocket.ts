import type { BackendWsMessage } from '../types/backend';
import { getApiBase } from './api';
import { resolveWsBase } from './preferences';

export interface TaskWebSocketHandlers {
  onMessage: (message: BackendWsMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
}

function buildWsUrl(taskId: string) {
  const wsBase = resolveWsBase();
  if (wsBase) {
    return `${wsBase.replace(/\/$/, '')}/ws/${taskId}`;
  }

  const apiBase = getApiBase();

  if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) {
    const wsBase = apiBase.replace(/^http/, 'ws');
    return `${wsBase}/ws/${taskId}`;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${apiBase}/ws/${taskId}`;
}

export function subscribeTaskWebSocket(taskId: string, handlers: TaskWebSocketHandlers) {
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let manualClose = false;
  let reconnectAttempts = 0;

  const clearReconnectTimer = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const connect = () => {
    clearReconnectTimer();
    socket = new WebSocket(buildWsUrl(taskId));

    socket.onopen = () => {
      reconnectAttempts = 0;
      handlers.onOpen?.();
    };

    socket.onmessage = (event) => {
      try {
        handlers.onMessage(JSON.parse(event.data) as BackendWsMessage);
      } catch {
        handlers.onError?.();
      }
    };

    socket.onerror = () => {
      handlers.onError?.();
    };

    socket.onclose = () => {
      handlers.onClose?.();

      if (manualClose) {
        return;
      }

      const delay = Math.min(1000 * 2 ** reconnectAttempts, 8000);
      reconnectAttempts += 1;
      reconnectTimer = window.setTimeout(connect, delay);
    };
  };

  connect();

  return () => {
    manualClose = true;
    clearReconnectTimer();
    socket?.close();
  };
}
