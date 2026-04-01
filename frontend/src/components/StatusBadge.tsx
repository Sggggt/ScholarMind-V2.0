import type { TaskStatus } from '../shared/types';

const statusMap: Record<TaskStatus, { label: string; bg: string; text: string; dot: string }> = {
  pending:   { label: '等待中', bg: 'bg-gray-100 dark:bg-gray-800',     text: 'text-gray-600 dark:text-gray-400',     dot: 'bg-gray-400' },
  running:   { label: '运行中', bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-700 dark:text-green-400',   dot: 'bg-green-500' },
  paused:    { label: '已暂停', bg: 'bg-yellow-50 dark:bg-yellow-900/20', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-500' },
  review:    { label: '待审阅', bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-700 dark:text-orange-400', dot: 'bg-orange-500' },
  completed: { label: '已完成', bg: 'bg-blue-50 dark:bg-blue-900/20',   text: 'text-blue-700 dark:text-blue-400',     dot: 'bg-blue-500' },
  failed:    { label: '失败',   bg: 'bg-red-50 dark:bg-red-900/20',     text: 'text-red-700 dark:text-red-400',       dot: 'bg-red-500' },
  aborted:   { label: '已终止', bg: 'bg-gray-100 dark:bg-gray-800',     text: 'text-gray-600 dark:text-gray-400',     dot: 'bg-gray-500' },
};

export default function StatusBadge({ status }: { status: TaskStatus }) {
  const cfg = statusMap[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${status === 'running' ? 'animate-pulse' : ''}`} />
      {cfg.label}
    </span>
  );
}
