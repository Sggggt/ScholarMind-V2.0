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
    return `${wsBase.replace(/\/$/, '')}/ws/${taskId}?client_type=desktop`;
  }

  const apiBase = getApiBase();

  if (apiBase.startsWith('http://') || apiBase.startsWith('https://')) {
    const wsBase = apiBase.replace(/^http/, 'ws');
    return `${wsBase}/ws/${taskId}?client_type=desktop`;
  }

  // 相对路径情况：apiBase = '/api'，直接构建 '/ws'
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/${taskId}?client_type=desktop`;
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

  const sendPong = () => {
    try {
      socket?.send(JSON.stringify({ type: "pong", timestamp: Date.now() / 1000 }));
    } catch {
      // 忽略发送错误
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
        const data = JSON.parse(event.data);
        // 处理心跳 ping
        if (data?.type === "ping") {
          sendPong();
          return;
        }
        handlers.onMessage(data as BackendWsMessage);
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
