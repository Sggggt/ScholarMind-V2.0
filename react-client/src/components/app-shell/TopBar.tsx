import { History, Radio, RefreshCw, Settings2, Smartphone, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { clearApiCache, getConnectionInfo } from '../../services/api';
import { routeMeta } from '../../data/routeData';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

const statusLabelMap: Record<string, string> = {
  pending: '待启动',
  running: '运行中',
  paused: '已暂停',
  review: '待评审',
  completed: '已完成',
  failed: '失败',
  aborted: '已终止',
};

export default function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentTask = useWorkspaceStore((state) => state.currentTask);
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const currentStage = useWorkspaceStore((state) => state.currentStage);
  const isWebSocketConnected = useWorkspaceStore((state) => state.isWebSocketConnected);
  const initializeWorkspaceData = useWorkspaceStore((state) => state.initializeWorkspaceData);
  const refreshCurrentTask = useWorkspaceStore((state) => state.refreshCurrentTask);
  const refreshLogs = useWorkspaceStore((state) => state.refreshLogs);
  const showToast = useWorkspaceStore((state) => state.showToast);
  const route = routeMeta.find((item) => item.path === location.pathname);
  const currentStageRoute = routeMeta.find((item) => item.id === currentStage);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mobileConnectionCount, setMobileConnectionCount] = useState(0);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const fetchConnectionInfo = async () => {
      try {
        const info = await getConnectionInfo();
        setMobileConnectionCount(info.mobile_connection_count ?? 0);
      } catch {
        setMobileConnectionCount(0);
      }
    };

    fetchConnectionInfo();
    intervalId = setInterval(fetchConnectionInfo, 5000);

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  const handleRefresh = async () => {
    if (isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    clearApiCache();

    try {
      await initializeWorkspaceData();

      if (currentTaskId) {
        await Promise.all([refreshCurrentTask(), refreshLogs(currentTaskId)]);
      }

      showToast('已同步最新任务状态');
    } catch (error) {
      showToast(error instanceof Error ? error.message : '刷新失败');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-main">
        <div className="topbar-path">
          <span>{route?.section === 'workflow' ? '研究阶段' : '工作区'}</span>
          <span className="topbar-divider-dot" />
          <span>{route?.title ?? 'ScholarMind'}</span>
        </div>
        <div className="topbar-title">{currentTask?.title ?? route?.title ?? 'ScholarMind'}</div>
        <div className="topbar-subline">
          <span className="topbar-status">
            <Radio size={12} />
            {statusLabelMap[currentTask?.status ?? 'pending'] ?? '待启动'}
          </span>
          <span className="topbar-divider" />
          <span>{currentTask?.current_module ?? '未选择任务'}</span>
          <span className="topbar-divider" />
          <span>{route?.section === 'workflow' ? route.title : currentStageRoute?.title ?? currentStage}</span>
        </div>
      </div>

      <div className="topbar-tools">
        <button
          className="topbar-icon-button"
          disabled={isRefreshing}
          onClick={() => void handleRefresh()}
          type="button"
          aria-label="刷新页面"
        >
          <RefreshCw size={16} />
        </button>
        <button className="topbar-icon-button" onClick={() => navigate('/workflow')} type="button" aria-label="研究流程">
          <Workflow size={16} />
        </button>
        <button className="topbar-icon-button" onClick={() => navigate('/history')} type="button" aria-label="历史任务">
          <History size={16} />
        </button>
        <button className="topbar-icon-button" onClick={() => navigate('/settings')} type="button" aria-label="设置">
          <Settings2 size={16} />
        </button>
        {mobileConnectionCount > 0 && (
          <div className="current-indicator mobile-connected">
            <Smartphone size={14} />
            <span>手机已连接 ({mobileConnectionCount})</span>
          </div>
        )}
        <div className="current-indicator">
          <span className={`connection-dot${isWebSocketConnected ? ' live' : ''}`} />
          <span>{isWebSocketConnected ? '实时同步已连接' : '实时同步未连接'}</span>
        </div>
      </div>
    </header>
  );
}
