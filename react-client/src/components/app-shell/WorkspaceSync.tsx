import { useEffect, useRef } from 'react';
import { subscribeTaskWebSocket } from '../../services/websocket';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

export default function WorkspaceSync() {
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const initializeWorkspaceData = useWorkspaceStore((state) => state.initializeWorkspaceData);
  const refreshCurrentTask = useWorkspaceStore((state) => state.refreshCurrentTask);
  const refreshLogs = useWorkspaceStore((state) => state.refreshLogs);
  const handleWsMessage = useWorkspaceStore((state) => state.handleWsMessage);
  const setWebSocketStatus = useWorkspaceStore((state) => state.setWebSocketStatus);
  const runStatus = useWorkspaceStore((state) => state.runStatus);
  const isWebSocketConnected = useWorkspaceStore((state) => state.isWebSocketConnected);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void initializeWorkspaceData();
  }, [initializeWorkspaceData]);

  useEffect(() => {
    if (!currentTaskId) {
      setWebSocketStatus(false);
      return undefined;
    }

    void refreshCurrentTask({ background: true });
    void refreshLogs(currentTaskId);

    const clearRefreshTimer = () => {
      if (refreshTimerRef.current !== null) {
        window.clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };

    const unsubscribe = subscribeTaskWebSocket(currentTaskId, {
      onMessage: (message) => {
        handleWsMessage(message);
        setWebSocketStatus(true);
        clearRefreshTimer();

        if (message.type === 'completed') {
          void Promise.all([refreshCurrentTask({ background: true }), refreshLogs(currentTaskId)]);
          return;
        }

        if (runStatus === 'running' || runStatus === 'idle' || runStatus === 'review') {
          refreshTimerRef.current = window.setTimeout(() => {
            void refreshCurrentTask({ background: true });
          }, 1200);
        }
      },
      onOpen: () => setWebSocketStatus(true),
      onClose: () => setWebSocketStatus(false),
      onError: () => setWebSocketStatus(false),
    });

    return () => {
      clearRefreshTimer();
      setWebSocketStatus(false);
      unsubscribe();
    };
  }, [
    currentTaskId,
    handleWsMessage,
    refreshCurrentTask,
    refreshLogs,
    runStatus,
    setWebSocketStatus,
  ]);

  useEffect(() => {
    if (!currentTaskId || isWebSocketConnected) {
      return undefined;
    }

    if (!['running', 'idle', 'review'].includes(runStatus)) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void Promise.all([refreshCurrentTask({ background: true }), refreshLogs(currentTaskId)]);
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentTaskId, isWebSocketConnected, refreshCurrentTask, refreshLogs, runStatus]);

  return null;
}
