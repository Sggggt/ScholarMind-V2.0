// ============================================================
// 后端连接状态管理
// ============================================================

import { create } from 'zustand';

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

interface ConnectionState {
  wsStatus: ConnectionStatus;
  apiStatus: ConnectionStatus;
  lastPingAt: string | null;
  setWsStatus: (status: ConnectionStatus) => void;
  setApiStatus: (status: ConnectionStatus) => void;
  setLastPing: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  wsStatus: 'disconnected',
  apiStatus: 'disconnected',
  lastPingAt: null,

  setWsStatus: (wsStatus) => set({ wsStatus }),
  setApiStatus: (apiStatus) => set({ apiStatus }),
  setLastPing: () => set({ lastPingAt: new Date().toISOString() }),
}));
