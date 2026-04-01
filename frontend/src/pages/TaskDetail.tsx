import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Pause,
  Play,
  Square,
  FileText,
  Code,
  BarChart3,
  ScrollText,
  ArrowUp,
  GitBranch,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Clock,
  UserCheck,
  AlertCircle,
  Lightbulb,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { useToastStore } from '../stores/toastStore';
import StatusBadge from '../components/StatusBadge';
import ModuleProgress from '../components/ModuleProgress';
import PipelineView from '../components/PipelineView';
import XTerminal from '../components/XTerminal';
import { TaskDetailSkeleton } from '../components/SkeletonLoader';
import { DEMO_MODULE_IO } from '../shared/mockData';
import { isDemoMode } from '../services/api';
import type { Task, ModuleId } from '../shared/types';

type Tab = 'pipeline' | 'detail' | 'flowchart' | 'logs' | 'paper' | 'code' | 'review';

/* ── 模块输入/输出详情面板 ── */
function ModuleIOPanel({ task }: { task: Task }) {
  const [expandedModule, setExpandedModule] = useState<ModuleId | null>(null);

  // 只在 Demo 模式下显示完整的 IO 数据
  const moduleIO = isDemoMode() ? DEMO_MODULE_IO : null;

  if (!moduleIO) {
    return (
      <div className="text-center py-8">
        <Info size={32} className="mx-auto mb-3 text-[#d9d9d9] dark:text-[#444]" />
        <p className="text-sm text-[#999]">连接后端后将展示每个模块的详细输入/输出</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* 流程概览 */}
      <div className="flex items-center gap-1.5 mb-3 p-3 rounded-xl bg-[#f9f9f9] dark:bg-[#1e1e2e] border border-[#e5e5e5] dark:border-[#333]">
        {moduleIO.map((m, i) => {
          const taskModule = task.modules.find((tm) => tm.module_id === m.moduleId);
          const isCompleted = taskModule?.status === 'completed';
          const isRunning = taskModule?.status === 'running';
          return (
            <span key={m.moduleId} className="flex items-center gap-1">
              <button
                onClick={() => setExpandedModule(expandedModule === m.moduleId ? null : m.moduleId)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                  expandedModule === m.moduleId
                    ? 'bg-[#10a37f] text-white ring-2 ring-[#10a37f]/30'
                    : isCompleted
                      ? 'bg-[#10a37f]/10 text-[#10a37f]'
                      : isRunning
                        ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400 animate-pulse'
                        : 'bg-[#f4f4f4] dark:bg-[#2a2a3e] text-[#999]'
                }`}
              >
                {m.moduleId}
              </button>
              {i < moduleIO.length - 1 && (
                <ArrowRight size={8} className={`${isCompleted ? 'text-[#10a37f]' : 'text-[#ddd] dark:text-[#444]'}`} />
              )}
            </span>
          );
        })}
      </div>

      {/* 模块详情卡片列表 */}
      {moduleIO.map((m) => {
        const isExpanded = expandedModule === m.moduleId;
        const taskModule = task.modules.find((tm) => tm.module_id === m.moduleId);
        const isCompleted = taskModule?.status === 'completed';
        const isRunning = taskModule?.status === 'running';

        return (
          <div
            key={m.moduleId}
            className={`rounded-xl border overflow-hidden transition-all ${
              isExpanded
                ? 'border-[#10a37f]/50 bg-white dark:bg-[#1e1e2e] shadow-sm'
                : 'border-[#e5e5e5] dark:border-[#333]'
            }`}
          >
            {/* 模块头部 */}
            <button
              onClick={() => setExpandedModule(isExpanded ? null : m.moduleId)}
              className="w-full flex items-center gap-3 p-3 text-left hover:bg-[#f9f9f9] dark:hover:bg-[#222238] transition-colors"
            >
              {/* 状态图标 */}
              <div className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                isCompleted
                  ? 'bg-[#10a37f]/10 text-[#10a37f]'
                  : isRunning
                    ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-600'
                    : 'bg-[#f4f4f4] dark:bg-[#2a2a3e] text-[#999]'
              }`}>
                {isCompleted ? <CheckCircle2 size={14} /> : m.moduleId}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">
                    {m.moduleId} {m.name}
                  </span>
                  {m.hasReview && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400">
                      <UserCheck size={9} />
                      人工审阅
                    </span>
                  )}
                  {isCompleted && (
                    <span className="text-[10px] text-[#10a37f] font-medium">已完成</span>
                  )}
                  {isRunning && (
                    <span className="text-[10px] text-yellow-600 dark:text-yellow-400 font-medium animate-pulse">
                      执行中 {Math.round(taskModule?.percent || 0)}%
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[10px] text-[#999] flex items-center gap-0.5">
                    <Clock size={9} /> {m.duration}
                  </span>
                </div>
              </div>

              <div className="shrink-0 text-[#999]">
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
            </button>

            {/* 展开的详情 */}
            {isExpanded && (
              <div className="px-3 pb-3 space-y-2.5 border-t border-[#f4f4f4] dark:border-[#2a2a3e]">
                {/* 输入 */}
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20 mt-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <ArrowRight size={10} className="text-blue-500" />
                    <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">输入 Input</span>
                  </div>
                  <pre className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed whitespace-pre-wrap font-sans">{m.input}</pre>
                </div>

                {/* 输出 */}
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/20">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <ArrowRight size={10} className="text-green-500 rotate-180" />
                    <span className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider">输出 Output</span>
                  </div>
                  <pre className="text-xs text-green-800 dark:text-green-300 leading-relaxed whitespace-pre-wrap font-sans">{m.output}</pre>
                </div>

                {/* 关键发现 */}
                {m.keyFindings && m.keyFindings.length > 0 && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Lightbulb size={10} className="text-amber-500" />
                      <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">关键发现</span>
                    </div>
                    <ul className="space-y-1">
                      {m.keyFindings.map((f, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                          <span className="shrink-0 mt-0.5 w-1 h-1 rounded-full bg-amber-400" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 元信息 */}
                <div className="flex items-center gap-4 text-[11px] text-[#999] pt-1">
                  <span className="flex items-center gap-1">
                    <Clock size={10} className="text-[#10a37f]" />
                    预计耗时：{m.duration}
                  </span>
                  {m.hasReview && (
                    <span className="flex items-center gap-1 text-orange-500">
                      <AlertCircle size={10} />
                      此步骤需人工确认
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function TaskDetail() {
  const {
    tasks,
    currentTaskId,
    pauseTask,
    resumeTask,
    abortTask,
    fetchTask,
    loading,
  } = useTaskStore();

  const addToast = useToastStore((s) => s.addToast);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('detail');
  const [input, setInput] = useState('');

  const task = tasks.find((t) => t.id === currentTaskId);

  useEffect(() => {
    if (currentTaskId) {
      fetchTask(currentTaskId);
      const interval = setInterval(() => fetchTask(currentTaskId), 5000);
      return () => clearInterval(interval);
    }
  }, [currentTaskId, fetchTask]);

  if (!task && loading) {
    return <TaskDetailSkeleton />;
  }

  if (!task) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#999] dark:text-[#666] text-sm">
        任务未找到
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode; route?: string }[] = [
    { key: 'detail', label: '详情', icon: <Info size={14} /> },
    { key: 'pipeline', label: '进度', icon: <BarChart3 size={14} /> },
    { key: 'flowchart', label: '流程图', icon: <GitBranch size={14} /> },
    { key: 'logs', label: '日志', icon: <ScrollText size={14} />, route: `/task/${task.id}/logs` },
    { key: 'paper', label: '论文', icon: <FileText size={14} />, route: `/task/${task.id}/paper` },
    { key: 'code', label: '代码', icon: <Code size={14} />, route: `/task/${task.id}/code` },
    { key: 'review', label: '评审', icon: <BarChart3 size={14} />, route: `/task/${task.id}/review` },
  ];

  const handlePause = async () => {
    await pauseTask(task.id);
    addToast('info', '任务已暂停');
  };

  const handleResume = async () => {
    await resumeTask(task.id);
    addToast('success', '任务已恢复运行');
  };

  const handleAbort = async () => {
    await abortTask(task.id);
    addToast('warning', '任务已终止');
  };

  return (
    <div className="flex-1 flex flex-col h-full animate-fade-in">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-4 py-6">
          {/* User message bubble */}
          <div className="flex justify-end mb-6">
            <div className="max-w-[85%] bg-[#f4f4f4] dark:bg-[#2a2a3e] rounded-2xl px-5 py-3">
              <p className="text-sm text-[#0d0d0d] dark:text-[#e5e5e5]">{task.topic}</p>
            </div>
          </div>

          {/* Agent response area */}
          <div className="mb-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-7 h-7 rounded-full bg-[#10a37f] flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-white text-xs font-bold">AI</span>
              </div>
              <div className="flex-1 min-w-0">
                {/* Task info header */}
                <div className="flex items-center gap-3 mb-4">
                  <StatusBadge status={task.status} />
                  <span className="text-xs text-[#999]">
                    {new Date(task.created_at).toLocaleString('zh-CN')}
                  </span>
                  {isDemoMode() && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400">
                      演示数据
                    </span>
                  )}
                </div>

                {/* Tab bar */}
                <div className="flex items-center gap-1 mb-4 border-b border-[#e5e5e5] dark:border-[#333] overflow-x-auto">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => {
                        if (tab.route) {
                          navigate(tab.route);
                        } else {
                          setActiveTab(tab.key);
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors border-b-2 -mb-px whitespace-nowrap ${
                        activeTab === tab.key && !tab.route
                          ? 'border-[#10a37f] text-[#0d0d0d] dark:text-[#e5e5e5] font-medium'
                          : 'border-transparent text-[#999] hover:text-[#666] dark:hover:text-[#bbb]'
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                      {tab.route && <ExternalLink size={10} className="opacity-40" />}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <TabContent tab={activeTab} task={task} />

                {/* Action buttons */}
                {(task.status === 'running' || task.status === 'paused') && (
                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#e5e5e5] dark:border-[#333]">
                    {task.status === 'running' && (
                      <button
                        onClick={handlePause}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#666] dark:text-[#aaa] bg-[#f4f4f4] dark:bg-[#2a2a3e] hover:bg-[#ececec] dark:hover:bg-[#333] transition-colors"
                      >
                        <Pause size={12} />
                        暂停
                      </button>
                    )}
                    {task.status === 'paused' && (
                      <button
                        onClick={handleResume}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-[#10a37f] hover:bg-[#0d8a6c] transition-colors"
                      >
                        <Play size={12} />
                        恢复
                      </button>
                    )}
                    <button
                      onClick={handleAbort}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <Square size={12} />
                      终止
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom input for feedback */}
      <div className="border-t border-[#e5e5e5] dark:border-[#333] bg-white dark:bg-[#1a1a2e]">
        <div className="max-w-[720px] mx-auto px-4 py-3">
          <div className="relative bg-[#f4f4f4] dark:bg-[#2a2a3e] rounded-2xl">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入反馈或补充说明..."
              rows={1}
              className="w-full px-4 py-3 pr-12 bg-transparent rounded-2xl resize-none text-sm text-[#0d0d0d] dark:text-[#e5e5e5] placeholder:text-[#999] focus:outline-none"
            />
            <button
              disabled={!input.trim()}
              className={`absolute right-3 bottom-2.5 p-1.5 rounded-full transition-colors ${
                input.trim()
                  ? 'bg-[#0d0d0d] dark:bg-white text-white dark:text-[#0d0d0d] hover:bg-[#333] dark:hover:bg-[#e5e5e5]'
                  : 'bg-[#d9d9d9] dark:bg-[#444] text-white cursor-not-allowed'
              }`}
            >
              <ArrowUp size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabContent({ tab, task }: { tab: string; task: Task }) {
  switch (tab) {
    case 'detail':
      return <ModuleIOPanel task={task} />;
    case 'pipeline':
      return <PipelineTab task={task} />;
    case 'flowchart':
      return <FlowchartTab task={task} />;
    case 'logs':
      return <LogsTab />;
    case 'paper':
      return <PaperTab />;
    case 'code':
      return <CodeTab />;
    case 'review':
      return <ReviewTab />;
    default:
      return null;
  }
}

function PipelineTab({ task }: { task: Task }) {
  return (
    <div className="space-y-2">
      {task.modules.map((m) => (
        <ModuleProgress key={m.module_id} module={m} />
      ))}
      {task.modules.length === 0 && (
        <div className="text-sm text-[#999] py-8 text-center">
          流水线尚未启动
        </div>
      )}
    </div>
  );
}

function FlowchartTab({ task }: { task: Task }) {
  return (
    <div>
      {task.modules.length > 0 ? (
        <PipelineView modules={task.modules} />
      ) : (
        <div className="text-sm text-[#999] py-8 text-center">
          流水线尚未启动
        </div>
      )}
    </div>
  );
}

function LogsTab() {
  const { logs } = useTaskStore();

  return (
    <div className="h-[400px] rounded-xl overflow-hidden">
      <XTerminal logs={logs} autoScroll={true} />
    </div>
  );
}

function PaperTab() {
  return (
    <div className="text-center py-12">
      <FileText size={40} className="mx-auto mb-3 text-[#d9d9d9]" />
      <p className="text-sm text-[#999]">论文生成后将在此处预览</p>
      <p className="text-xs text-[#ccc] mt-1">支持 LaTeX / PDF 格式</p>
    </div>
  );
}

function CodeTab() {
  return (
    <div className="text-center py-12">
      <Code size={40} className="mx-auto mb-3 text-[#d9d9d9]" />
      <p className="text-sm text-[#999]">代码生成后将在此处查看</p>
      <p className="text-xs text-[#ccc] mt-1">支持语法高亮和文件浏览</p>
    </div>
  );
}

function ReviewTab() {
  const { reviewResult } = useTaskStore();

  if (!reviewResult) {
    return (
      <div className="text-center py-12">
        <BarChart3 size={40} className="mx-auto mb-3 text-[#d9d9d9]" />
        <p className="text-sm text-[#999]">评审完成后将在此处展示</p>
        <p className="text-xs text-[#ccc] mt-1">包含多维度评分和详细评语</p>
      </div>
    );
  }

  const decisionMap: Record<string, { label: string; color: string }> = {
    accept: { label: '接收', color: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
    weak_accept: { label: '弱接收', color: 'text-green-500 bg-green-50 dark:bg-green-900/20' },
    weak_reject: { label: '弱拒绝', color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' },
    reject: { label: '拒绝', color: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
  };

  const decision = decisionMap[reviewResult.decision] || decisionMap.reject;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold text-[#0d0d0d] dark:text-[#e5e5e5]">
          {reviewResult.overall_score}
        </span>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${decision.color}`}>
          {decision.label}
        </span>
      </div>
      <p className="text-sm text-[#666] dark:text-[#aaa] leading-relaxed">{reviewResult.summary}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {reviewResult.dimensions.map((d, i) => (
          <div key={i} className="p-3 rounded-xl bg-[#f9f9f9] dark:bg-[#1e1e2e] border border-[#e5e5e5] dark:border-[#333]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">{d.name}</span>
              <span className="text-xs font-medium text-[#666] dark:text-[#aaa]">{d.score}/{d.max_score}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  d.score / d.max_score >= 0.7 ? 'bg-green-500' :
                  d.score / d.max_score >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                }`}
                style={{ width: `${(d.score / d.max_score) * 100}%` }}
              />
            </div>
            {d.comment && (
              <p className="text-xs text-[#999] mt-1.5 line-clamp-2">{d.comment}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
