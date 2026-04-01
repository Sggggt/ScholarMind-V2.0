// ============================================================
// WebSocket 连接管理（含连接状态通知）
// ============================================================

import type { WsMessage } from '../shared/types';
import { useConnectionStore } from '../stores/connectionStore';

type MessageHandler = (msg: WsMessage) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 3000;
  private url: string;

  constructor() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // 同域部署：直接用当前 host:port；Vite 开发模式：连 8000
    const host = window.location.hostname;
    const port = window.location.port === '5173' || window.location.port === '5174'
      ? '8000' : window.location.port;
    this.url = `${protocol}//${host}:${port}/api/ws`;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    useConnectionStore.getState().setWsStatus('connecting');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[WS] Connected');
        this.reconnectDelay = 3000;
        useConnectionStore.getState().setWsStatus('connected');
        useConnectionStore.getState().setLastPing();
      };

      this.ws.onmessage = (event) => {
        useConnectionStore.getState().setLastPing();
        try {
          const msg: WsMessage = JSON.parse(event.data);
          this.handlers.forEach((handler) => handler(msg));
        } catch (e) {
          console.error('[WS] Parse error:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[WS] Disconnected, reconnecting...');
        useConnectionStore.getState().setWsStatus('disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[WS] Error:', err);
        useConnectionStore.getState().setWsStatus('error');
        this.ws?.close();
      };
    } catch (e) {
      console.error('[WS] Connection failed:', e);
      useConnectionStore.getState().setWsStatus('error');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, 30000);
    }, this.reconnectDelay);
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    useConnectionStore.getState().setWsStatus('disconnected');
  }

  subscribe(handler: MessageHandler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsService = new WebSocketService();
