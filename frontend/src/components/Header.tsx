import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PanelLeftOpen,
  FlaskConical,
  Sun,
  Moon,
  Monitor,
  Bell,
  Wifi,
  WifiOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Info,
  X,
  Trash2,
} from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useTheme } from '../hooks/useTheme';
import { useConnectionStore } from '../stores/connectionStore';
import { useNotificationStore } from '../stores/notificationStore';
import { isDemoMode } from '../services/api';
import type { ConnectionStatus } from '../stores/connectionStore';
import type { NotificationType } from '../stores/notificationStore';

/* ── 连接状态指示灯（小圆点 + hover 展示详情） ── */
function ConnectionIndicator() {
  const { wsStatus, lastPingAt } = useConnectionStore();
  const [showDetail, setShowDetail] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowDetail(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const statusConfig: Record<ConnectionStatus, { color: string; label: string; icon: React.ReactNode }> = {
    connected:    { color: 'bg-green-500', label: '已连接', icon: <Wifi size={14} className="text-green-500" /> },
    disconnected: { color: 'bg-gray-400',  label: '未连接', icon: <WifiOff size={14} className="text-gray-400" /> },
    connecting:   { color: 'bg-yellow-500 animate-pulse', label: '连接中...', icon: <Loader2 size={14} className="text-yellow-500 animate-spin" /> },
    error:        { color: 'bg-red-500',   label: '连接错误', icon: <WifiOff size={14} className="text-red-500" /> },
  };

  const cfg = statusConfig[wsStatus];

  const handleMouseEnter = () => {
    hoverTimer.current = setTimeout(() => setShowDetail(true), 300);
  };

  const handleMouseLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    // 延迟关闭，让用户能移到弹窗上
    hoverTimer.current = setTimeout(() => setShowDetail(false), 200);
  };

  return (
    <div
      className="relative"
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={() => setShowDetail(!showDetail)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-[#666] dark:text-[#999] hover:bg-[#f4f4f4] dark:hover:bg-[#2a2a3e] transition-colors"
        title={`WebSocket: ${cfg.label}`}
      >
        <span className={`w-2 h-2 rounded-full ${cfg.color}`} />
      </button>

      {showDetail && (
        <div
          className="absolute right-0 top-full mt-1 w-64 p-3 rounded-xl bg-white dark:bg-[#1e1e2e] border border-[#e5e5e5] dark:border-[#333] shadow-lg z-50"
          onMouseEnter={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }}
          onMouseLeave={handleMouseLeave}
        >
          <h4 className="text-xs font-medium text-[#0d0d0d] dark:text-[#e5e5e5] mb-2">连接状态</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#666] dark:text-[#aaa]">WebSocket</span>
              <div className="flex items-center gap-1.5">
                {cfg.icon}
                <span className="text-xs text-[#0d0d0d] dark:text-[#e5e5e5]">{cfg.label}</span>
              </div>
            </div>
            {lastPingAt && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#666] dark:text-[#aaa]">最后通信</span>
                <span className="text-xs text-[#0d0d0d] dark:text-[#e5e5e5]">
                  {new Date(lastPingAt).toLocaleTimeString('zh-CN')}
                </span>
              </div>
            )}
            {isDemoMode() && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#666] dark:text-[#aaa]">运行模式</span>
                <span className="text-xs text-blue-500 font-medium">演示模式</span>
              </div>
            )}
          </div>
          {(wsStatus === 'disconnected' || wsStatus === 'error') && (
            <p className="mt-2 text-[10px] text-[#999] leading-relaxed">
              {isDemoMode()
                ? '当前使用演示数据。连接后端服务后将自动切换为真实数据。'
                : '请确认后端服务已启动，或在设置页检查连接地址配置。'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── 通知中心 ── */
function NotificationCenter() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll } = useNotificationStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const typeIcon: Record<NotificationType, React.ReactNode> = {
    info:    <Info size={14} className="text-blue-500" />,
    success: <CheckCircle2 size={14} className="text-green-500" />,
    warning: <AlertCircle size={14} className="text-orange-500" />,
    error:   <XCircle size={14} className="text-red-500" />,
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-lg text-[#666] dark:text-[#999] hover:bg-[#f4f4f4] dark:hover:bg-[#2a2a3e] transition-colors"
        title="通知中心"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 rounded-xl bg-white dark:bg-[#1e1e2e] border border-[#e5e5e5] dark:border-[#333] shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e5e5] dark:border-[#333]">
            <h4 className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">通知</h4>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-[10px] text-[#10a37f] hover:underline"
                >
                  全部已读
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="p-1 rounded hover:bg-[#f4f4f4] dark:hover:bg-[#2a2a3e] text-[#999]"
                  title="清空"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell size={24} className="mx-auto mb-2 text-[#d9d9d9]" />
                <p className="text-xs text-[#999]">暂无通知</p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    markAsRead(n.id);
                    if (n.taskId) {
                      navigate(`/task/${n.taskId}`);
                      setOpen(false);
                    }
                  }}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#f9f9f9] dark:hover:bg-[#222238] transition-colors border-b border-[#f4f4f4] dark:border-[#2a2a3e] last:border-0 ${
                    !n.read ? 'bg-[#10a37f]/5 dark:bg-[#10a37f]/5' : ''
                  }`}
                >
                  <div className="shrink-0 mt-0.5">{typeIcon[n.type]}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[#0d0d0d] dark:text-[#e5e5e5] truncate">{n.title}</span>
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-[#10a37f] shrink-0" />}
                    </div>
                    <p className="text-[11px] text-[#999] mt-0.5 line-clamp-2">{n.message}</p>
                    <span className="text-[10px] text-[#ccc] dark:text-[#555] mt-1 block">
                      {new Date(n.timestamp).toLocaleTimeString('zh-CN')}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 主 Header ── */
export default function Header() {
  const { sidebarOpen, toggleSidebar } = useTaskStore();
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const order = ['light', 'dark', 'system'] as const;
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % order.length]);
  };

  const themeIcon = theme === 'dark' ? <Moon size={16} /> : theme === 'system' ? <Monitor size={16} /> : <Sun size={16} />;
  const themeLabel = theme === 'dark' ? '暗色' : theme === 'system' ? '跟随系统' : '亮色';

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-transparent dark:border-[#333]">
      <div className="flex items-center gap-2">
        {!sidebarOpen && (
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-[#f4f4f4] dark:hover:bg-[#2a2a3e] transition-colors text-[#666] dark:text-[#999]"
            title="展开侧边栏"
          >
            <PanelLeftOpen size={18} />
          </button>
        )}
        <div className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-[#f4f4f4] dark:hover:bg-[#2a2a3e] transition-colors cursor-pointer">
          <FlaskConical size={16} className="text-[#10a37f]" />
          <span className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">AI Research Agent</span>
          {isDemoMode() && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
              Demo
            </span>
          )}
          <svg width="12" height="12" viewBox="0 0 12 12" className="text-[#999]">
            <path d="M3 5L6 8L9 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <ConnectionIndicator />
        <NotificationCenter />
        <button
          onClick={cycleTheme}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-[#666] dark:text-[#999] hover:bg-[#f4f4f4] dark:hover:bg-[#2a2a3e] transition-colors"
          title={`切换主题 — 当前：${themeLabel}`}
        >
          {themeIcon}
        </button>
      </div>
    </header>
  );
}
