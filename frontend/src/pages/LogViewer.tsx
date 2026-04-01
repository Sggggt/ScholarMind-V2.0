import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Filter, Search } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import XTerminal from '../components/XTerminal';
import type { ModuleId } from '../shared/types';
import { MODULE_NAMES } from '../shared/types';

export default function LogViewer({ taskId }: { taskId: string }) {
  const navigate = useNavigate();
  const { logs, fetchLogs } = useTaskStore();
  const [filterModule, setFilterModule] = useState<ModuleId | 'all'>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    fetchLogs(taskId);
    const interval = setInterval(() => fetchLogs(taskId), 3000);
    return () => clearInterval(interval);
  }, [taskId, fetchLogs]);

  const filteredLogs = logs.filter((log) => {
    if (filterModule !== 'all' && log.module_id !== filterModule) return false;
    if (filterLevel !== 'all' && log.level !== filterLevel) return false;
    if (searchText && !log.message.toLowerCase().includes(searchText.toLowerCase())) return false;
    return true;
  });

  const handleExport = () => {
    const text = filteredLogs
      .map((l) => `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.module_id ? `[${l.module_id}] ` : ''}${l.message}`)
      .join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `task-${taskId}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(`/task/${taskId}`)} className="flex items-center gap-1.5 text-sm text-[#999] hover:text-[#0d0d0d] dark:hover:text-[#e5e5e5] transition-colors">
          <ArrowLeft size={16} />
          返回任务
        </button>
        <h2 className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">追溯日志</h2>
      </div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#f4f4f4] dark:bg-[#2a2a3e] text-xs">
          <Filter size={12} className="text-[#999]" />
          <select
            value={filterModule}
            onChange={(e) => setFilterModule(e.target.value as ModuleId | 'all')}
            className="bg-transparent text-[#666] dark:text-[#aaa] outline-none cursor-pointer"
          >
            <option value="all">全部模块</option>
            {(Object.keys(MODULE_NAMES) as ModuleId[]).map((id) => (
              <option key={id} value={id}>{id} {MODULE_NAMES[id]}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#f4f4f4] dark:bg-[#2a2a3e] text-xs">
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value)}
            className="bg-transparent text-[#666] dark:text-[#aaa] outline-none cursor-pointer"
          >
            <option value="all">全部级别</option>
            <option value="info">INFO</option>
            <option value="warn">WARN</option>
            <option value="error">ERROR</option>
            <option value="debug">DEBUG</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#f4f4f4] dark:bg-[#2a2a3e] text-xs flex-1 min-w-[120px] max-w-[200px]">
          <Search size={12} className="text-[#999] shrink-0" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索日志..."
            className="bg-transparent text-[#666] dark:text-[#aaa] outline-none w-full placeholder:text-[#ccc]"
          />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <label className="flex items-center gap-1.5 text-xs text-[#999] cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            自动滚动
          </label>
          <button
            onClick={handleExport}
            className="p-1.5 rounded-lg hover:bg-[#f4f4f4] dark:hover:bg-[#2a2a3e] text-[#999] transition-colors"
            title="导出日志"
          >
            <Download size={14} />
          </button>
        </div>
      </div>

      {/* xterm.js Terminal */}
      <div className="flex-1 min-h-[300px] rounded-xl overflow-hidden">
        <XTerminal logs={filteredLogs} autoScroll={autoScroll} />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between mt-2 text-[10px] text-[#999]">
        <span>{filteredLogs.length} 条日志{filterModule !== 'all' || filterLevel !== 'all' ? '（已过滤）' : ''}</span>
        <span>总计 {logs.length} 条</span>
      </div>
    </div>
  );
}
