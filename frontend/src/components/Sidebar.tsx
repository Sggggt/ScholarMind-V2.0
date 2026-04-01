import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  FlaskConical,
  Settings,
  HelpCircle,
  PanelLeftClose,
  Pause,
  CircleDot,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Trash2,
  X,
  Filter,
  Keyboard,
  SquareCheck,
  Square,
  Archive,
} from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useToastStore } from '../stores/toastStore';
import { SidebarSkeleton } from './SkeletonLoader';
import { MODULE_NAMES } from '../shared/types';
import type { Task, TaskStatus, ModuleId } from '../shared/types';

const statusConfig: Record<TaskStatus, { icon: React.ReactNode; color: string; label: string }> = {
  pending:   { icon: <Clock size={14} />,       color: 'text-gray-400',   label: '等待中' },
  running:   { icon: <CircleDot size={14} />,   color: 'text-green-500',  label: '运行中' },
  paused:    { icon: <Pause size={14} />,       color: 'text-yellow-500', label: '已暂停' },
  review:    { icon: <AlertCircle size={14} />, color: 'text-orange-500', label: '待审阅' },
  completed: { icon: <CheckCircle2 size={14} />,color: 'text-blue-500',   label: '已完成' },
  failed:    { icon: <XCircle size={14} />,     color: 'text-red-500',    label: '已失败' },
  aborted:   { icon: <Trash2 size={14} />,      color: 'text-gray-500',   label: '已终止' },
};

const STATUS_FILTERS: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all',       label: '全部' },
  { value: 'running',   label: '运行中' },
  { value: 'paused',    label: '已暂停' },
  { value: 'review',    label: '待审阅' },
  { value: 'completed', label: '已完成' },
  { value: 'failed',    label: '已失败' },
];

/* ── 任务列表项（含进度预览） ── */
function TaskItem({ task, isActive, isSelecting, isSelected, onToggleSelect }: {
  task: Task;
  isActive: boolean;
  isSelecting: boolean;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const setCurrentTaskId = useTaskStore((s) => s.setCurrentTaskId);
  const navigate = useNavigate();
  const cfg = statusConfig[task.status];

  // 获取当前运行模块信息
  const currentModule = task.modules.find((m) => m.status === 'running');
  const completedCount = task.modules.filter((m) => m.status === 'completed').length;
  const totalCount = task.modules.length;

  const handleClick = () => {
    if (isSelecting) {
      onToggleSelect(task.id);
      return;
    }
    setCurrentTaskId(task.id);
    navigate(`/task/${task.id}`);
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm transition-colors group
        ${isActive && !isSelecting
          ? 'bg-[#ececec] dark:bg-[#333]'
          : 'hover:bg-[#ececec] dark:hover:bg-[#2a2a3e]'
        }
        ${isSelected ? 'bg-[#10a37f]/10 dark:bg-[#10a37f]/10' : ''}
      `}
    >
      {isSelecting ? (
        <span className="shrink-0 mt-0.5 text-[#10a37f]">
          {isSelected ? <SquareCheck size={14} /> : <Square size={14} />}
        </span>
      ) : (
        <span className={`shrink-0 mt-0.5 ${cfg.color}`}>{cfg.icon}</span>
      )}
      <div className="flex-1 min-w-0">
        <span className="block truncate text-[#0d0d0d] dark:text-[#e5e5e5] text-sm">{task.topic}</span>
        {/* 进度预览行 */}
        <div className="flex items-center gap-1.5 mt-1">
          {currentModule ? (
            <span className="text-[10px] text-[#10a37f] font-medium truncate">
              {currentModule.module_id} {MODULE_NAMES[currentModule.module_id as ModuleId]}
              {currentModule.percent > 0 && ` ${Math.round(currentModule.percent)}%`}
            </span>
          ) : task.status === 'completed' ? (
            <span className="text-[10px] text-blue-500">全部完成</span>
          ) : task.status === 'failed' ? (
            <span className="text-[10px] text-red-500">执行失败</span>
          ) : totalCount > 0 ? (
            <span className="text-[10px] text-[#999]">{completedCount}/{totalCount} 模块</span>
          ) : (
            <span className="text-[10px] text-[#ccc] dark:text-[#555]">
              {new Date(task.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
            </span>
          )}
          {/* Mini progress bar for running tasks */}
          {(task.status === 'running' || task.status === 'review') && totalCount > 0 && (
            <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden max-w-[60px]">
              <div
                className="h-full bg-[#10a37f] rounded-full transition-all"
                style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

/* ── 主组件 ── */
export default function Sidebar() {
  const {
    tasks,
    currentTaskId,
    sidebarOpen,
    toggleSidebar,
    setCurrentTaskId,
    fetchTasks,
    loading,
  } = useTaskStore();

  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  if (!sidebarOpen) return null;

  // Apply search and status filter
  const filteredTasks = tasks.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return t.topic.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q);
    }
    return true;
  });

  const runningTasks = filteredTasks.filter((t) => t.status === 'running' || t.status === 'review');
  const otherTasks = filteredTasks.filter((t) => t.status !== 'running' && t.status !== 'review');

  const handleNewTask = () => {
    setCurrentTaskId(null);
    navigate('/');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredTasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTasks.map((t) => t.id)));
    }
  };

  const handleBatchDelete = async () => {
    const ids = Array.from(selectedIds);
    for (const id of ids) {
      await useTaskStore.getState().deleteTask(id);
    }
    addToast('success', `已删除 ${ids.length} 个任务`);
    setSelectedIds(new Set());
    setIsSelecting(false);
    fetchTasks();
  };

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (searchQuery.trim() ? 1 : 0);

  return (
    <>
      {/* Mobile overlay backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm md:hidden"
        onClick={toggleSidebar}
      />

      <aside className="fixed md:relative z-40 w-[260px] h-screen flex flex-col bg-[#f9f9f9] dark:bg-[#171720] border-r border-[#e5e5e5] dark:border-[#333] shrink-0 transition-all">
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-3 pb-1">
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg hover:bg-[#ececec] dark:hover:bg-[#2a2a3e] transition-colors text-[#666] dark:text-[#999]"
            title="收起侧边栏 (Ctrl+B)"
          >
            <PanelLeftClose size={18} />
          </button>
          <div className="flex items-center gap-0.5">
            {isSelecting && (
              <button
                onClick={() => { setIsSelecting(false); setSelectedIds(new Set()); }}
                className="p-1.5 rounded-lg hover:bg-[#ececec] dark:hover:bg-[#2a2a3e] transition-colors text-[#999] text-xs"
                title="取消选择"
              >
                <X size={16} />
              </button>
            )}
            <button
              onClick={() => setIsSelecting(!isSelecting)}
              className={`p-1.5 rounded-lg hover:bg-[#ececec] dark:hover:bg-[#2a2a3e] transition-colors ${isSelecting ? 'text-[#10a37f]' : 'text-[#666] dark:text-[#999]'}`}
              title="批量管理"
            >
              <SquareCheck size={16} />
            </button>
            <button
              onClick={handleNewTask}
              className="p-1.5 rounded-lg hover:bg-[#ececec] dark:hover:bg-[#2a2a3e] transition-colors text-[#666] dark:text-[#999]"
              title="新建研究任务 (Ctrl+N)"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-[#222238] border border-[#e5e5e5] dark:border-[#444] text-sm transition-colors focus-within:border-[#10a37f]">
            <Search size={14} className="text-[#999] shrink-0" />
            <input
              type="text"
              data-search-input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索任务... (Ctrl+/)"
              className="flex-1 bg-transparent text-[#0d0d0d] dark:text-[#e5e5e5] placeholder:text-[#999] outline-none text-sm"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-[#999] hover:text-[#666] dark:hover:text-[#ccc]"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Status filter chips */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-1 mb-1.5">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
                showFilters || activeFilterCount > 0
                  ? 'text-[#10a37f] bg-[#10a37f]/10'
                  : 'text-[#999] hover:text-[#666] dark:hover:text-[#ccc]'
              }`}
            >
              <Filter size={11} />
              筛选
              {activeFilterCount > 0 && (
                <span className="ml-0.5 px-1 py-0 rounded-full bg-[#10a37f] text-white text-[9px] leading-[14px]">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {statusFilter !== 'all' && (
              <button
                onClick={() => setStatusFilter('all')}
                className="text-[10px] text-[#999] hover:text-[#666] dark:hover:text-[#ccc]"
              >
                清除
              </button>
            )}
          </div>
          {showFilters && (
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`px-2 py-0.5 rounded-md text-[11px] transition-colors ${
                    statusFilter === f.value
                      ? 'bg-[#10a37f] text-white'
                      : 'bg-[#ececec] dark:bg-[#2a2a3e] text-[#666] dark:text-[#aaa] hover:bg-[#ddd] dark:hover:bg-[#333]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Batch action bar */}
        {isSelecting && selectedIds.size > 0 && (
          <div className="px-3 pb-2 flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="text-[11px] text-[#10a37f] hover:underline"
            >
              {selectedIds.size === filteredTasks.length ? '取消全选' : '全选'}
            </button>
            <span className="text-[11px] text-[#999]">{selectedIds.size} 项已选</span>
            <div className="flex-1" />
            <button
              onClick={handleBatchDelete}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              <Trash2 size={10} />
              删除
            </button>
            <button
              onClick={() => addToast('info', '归档功能需后端支持')}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-[#666] dark:text-[#aaa] bg-[#f4f4f4] dark:bg-[#2a2a3e] hover:bg-[#ececec] dark:hover:bg-[#333] transition-colors"
            >
              <Archive size={10} />
              归档
            </button>
          </div>
        )}

        {/* Task list */}
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {loading && tasks.length === 0 ? (
            <SidebarSkeleton />
          ) : (
            <>
              {runningTasks.length > 0 && (
                <div className="mb-3">
                  <div className="px-2 py-1.5 text-xs font-medium text-[#999] uppercase tracking-wider">
                    进行中
                  </div>
                  {runningTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      isActive={task.id === currentTaskId}
                      isSelecting={isSelecting}
                      isSelected={selectedIds.has(task.id)}
                      onToggleSelect={toggleSelect}
                    />
                  ))}
                </div>
              )}

              {otherTasks.length > 0 && (
                <div>
                  <div className="px-2 py-1.5 text-xs font-medium text-[#999] uppercase tracking-wider">
                    历史任务
                  </div>
                  {otherTasks.map((task) => (
                    <TaskItem
                      key={task.id}
                      task={task}
                      isActive={task.id === currentTaskId}
                      isSelecting={isSelecting}
                      isSelected={selectedIds.has(task.id)}
                      onToggleSelect={toggleSelect}
                    />
                  ))}
                </div>
              )}

              {filteredTasks.length === 0 && tasks.length > 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-[#999] text-sm">
                  <Search size={32} className="mb-3 opacity-40" />
                  <p>无匹配任务</p>
                  <p className="text-xs mt-1">尝试修改搜索条件</p>
                </div>
              )}

              {/* 空状态引导 — 直接可点击创建 */}
              {tasks.length === 0 && !loading && (
                <div className="flex flex-col items-center justify-center py-12 text-sm">
                  <FlaskConical size={36} className="mb-3 text-[#10a37f] opacity-60" />
                  <p className="text-[#666] dark:text-[#aaa] mb-1">还没有研究任务</p>
                  <p className="text-xs text-[#999] mb-4">开始你的第一个 AI 辅助研究</p>
                  <button
                    onClick={handleNewTask}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#10a37f] hover:bg-[#0d8a6c] transition-colors"
                  >
                    <Plus size={14} />
                    创建第一个研究任务
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Bottom */}
        <div className="border-t border-[#e5e5e5] dark:border-[#333] px-2 py-2 space-y-0.5">
          <button
            onClick={() => navigate('/settings')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#666] dark:text-[#999] hover:bg-[#ececec] dark:hover:bg-[#2a2a3e] transition-colors"
          >
            <Settings size={16} />
            <span>设置</span>
            <span className="ml-auto text-[10px] text-[#ccc] dark:text-[#555]">Ctrl+,</span>
          </button>
          <button
            onClick={() => navigate('/help')}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-[#666] dark:text-[#999] hover:bg-[#ececec] dark:hover:bg-[#2a2a3e] transition-colors"
          >
            <HelpCircle size={16} />
            <span>帮助文档</span>
          </button>
        </div>
      </aside>
    </>
  );
}
