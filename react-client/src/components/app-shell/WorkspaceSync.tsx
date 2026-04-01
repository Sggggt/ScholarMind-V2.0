import { useEffect, useRef } from 'react';
import { subscribeTaskWebSocket } from '../../services/websocket';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

export default function WorkspaceSync() {
  const currentSessionId = useWorkspaceStore((state) => state.currentSessionId);
  const initializeWorkspaceData = useWorkspaceStore((state) => state.initializeWorkspaceData);
  const refreshTask = useWorkspaceStore((state) => state.refreshTask);
  const refreshLogs = useWorkspaceStore((state) => state.refreshLogs);
  const handleWsMessage = useWorkspaceStore((state) => state.handleWsMessage);
  const setWebSocketStatus = useWorkspaceStore((state) => state.setWebSocketStatus);
  const runStatus = useWorkspaceStore((state) => state.runStatus);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!currentSessionId) {
      setWebSocketStatus(false);
      return undefined;
    }

    void refreshTask(currentSessionId);
    void refreshLogs(currentSessionId);

    const unsubscribe = subscribeTaskWebSocket(currentSessionId, {
      onMessage: (message) => {
        handleWsMessage(message);
        setWebSocketStatus(true);

        if (refreshTimerRef.current !== null) {
          window.clearTimeout(refreshTimerRef.current);
        }

        // Only auto-refresh if task is running or completing
        if (runStatus === 'running' || runStatus === 'idle') {
          refreshTimerRef.current = window.setTimeout(() => {
            void refreshTask(currentSessionId);
          }, 1000); // Increased interval slightly to be less aggressive
        }
      },
      onOpen: () => setWebSocketStatus(true),
      onClose: () => setWebSocketStatus(false),
      onError: () => setWebSocketStatus(false),
    });

    return () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      setWebSocketStatus(false);
      unsubscribe();
    };
  }, [currentSessionId, handleWsMessage, refreshLogs, refreshTask, setWebSocketStatus, runStatus]);

  return null;
}
