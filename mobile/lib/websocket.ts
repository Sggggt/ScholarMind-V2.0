import type { WsMessage } from "./types";

export interface TaskWebSocketHandlers {
  onMessage: (message: WsMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
}

function toWsBase(baseUrl: string): string {
  return baseUrl.replace(/^http/i, "ws");
}

export function buildGlobalWsUrl(baseUrl: string): string {
  return `${toWsBase(baseUrl)}/ws`;
}

export function buildTaskWsUrl(baseUrl: string, taskId: string): string {
  return `${toWsBase(baseUrl)}/ws/${taskId}`;
}

export function probeWebSocket(url: string, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    let socket: WebSocket | null = null;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timerId);
      try {
        socket?.close();
      } catch {
        // noop
      }
      resolve(ok);
    };

    const timerId = setTimeout(() => finish(false), timeoutMs);

    try {
      socket = new WebSocket(url);
      socket.onopen = () => finish(true);
      socket.onerror = () => finish(false);
      socket.onclose = () => finish(false);
    } catch {
      finish(false);
    }
  });
}

export function subscribeTaskWebSocket(
  url: string,
  handlers: TaskWebSocketHandlers
): () => void {
  let socket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let manualClose = false;
  let reconnectAttempts = 0;

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const connect = () => {
    clearReconnectTimer();

    try {
      socket = new WebSocket(url);
    } catch {
      handlers.onError?.();
      return;
    }

    socket.onopen = () => {
      reconnectAttempts = 0;
      handlers.onOpen?.();
    };

    socket.onmessage = (event) => {
      try {
        handlers.onMessage(JSON.parse(event.data) as WsMessage);
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
      reconnectTimer = setTimeout(connect, delay);
    };
  };

  connect();

  return () => {
    manualClose = true;
    clearReconnectTimer();
    try {
      socket?.close();
    } catch {
      // noop
    }
  };
}
