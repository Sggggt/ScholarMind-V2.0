import { useEffect, useRef } from 'react';
import { subscribeGlobalWebSocket, subscribeTaskWebSocket } from '../../services/websocket';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

export default function WorkspaceSync() {
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const initializeWorkspaceData = useWorkspaceStore((state) => state.initializeWorkspaceData);
  const refreshCurrentTask = useWorkspaceStore((state) => state.refreshCurrentTask);
  const refreshLogs = useWorkspaceStore((state) => state.refreshLogs);
  const handleWsMessage = useWorkspaceStore((state) => state.handleWsMessage);
  const setWebSocketStatus = useWorkspaceStore((state) => state.setWebSocketStatus);
  const setMobileConnectionCount = useWorkspaceStore((state) => state.setMobileConnectionCount);
  const runStatus = useWorkspaceStore((state) => state.runStatus);
  const isWebSocketConnected = useWorkspaceStore((state) => state.isWebSocketConnected);

  useEffect(() => {
    void initializeWorkspaceData();
  }, [initializeWorkspaceData]);

  // Subscribe to global WS for task_created, task_deleted, connection_update
  useEffect(() => {
    const unsubscribe = subscribeGlobalWebSocket({
      onMessage: (message) => {
        if (message.type === 'connection_update' && message.data?.mobile_connection_count != null) {
          setMobileConnectionCount(message.data.mobile_connection_count as number);
        } else if (message.type === 'task_created' || message.type === 'task_deleted') {
          handleWsMessage(message);
        }
      },
      onOpen: () => {},
      onClose: () => {},
      onError: () => {},
    });

    return () => {
      unsubscribe();
    };
  }, [handleWsMessage, setMobileConnectionCount]);

  // Subscribe to per-task WS for progress updates
  useEffect(() => {
    if (!currentTaskId) {
      setWebSocketStatus(false);
      return undefined;
    }

    void refreshCurrentTask({ background: true });
    void refreshLogs(currentTaskId);

    const unsubscribe = subscribeTaskWebSocket(currentTaskId, {
      onMessage: (message) => {
        handleWsMessage(message);
        setWebSocketStatus(true);

        if (message.type === 'completed') {
          void Promise.all([refreshCurrentTask({ background: true }), refreshLogs(currentTaskId)]);
        }
      },
      onOpen: () => setWebSocketStatus(true),
      onClose: () => setWebSocketStatus(false),
      onError: () => setWebSocketStatus(false),
    });

    return () => {
      setWebSocketStatus(false);
      unsubscribe();
    };
  }, [
    currentTaskId,
    handleWsMessage,
    refreshCurrentTask,
    refreshLogs,
    setWebSocketStatus,
  ]);

  // Fallback polling (15s) when WS is disconnected and task is active
  useEffect(() => {
    if (!currentTaskId || isWebSocketConnected) {
      return undefined;
    }

    if (!['running', 'idle', 'review'].includes(runStatus)) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      void Promise.all([refreshCurrentTask({ background: true }), refreshLogs(currentTaskId)]);
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentTaskId, isWebSocketConnected, refreshCurrentTask, refreshLogs, runStatus]);

  return null;
}
