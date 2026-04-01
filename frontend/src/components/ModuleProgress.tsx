import type { ModuleProgress as ModuleProgressType, ModuleId } from '../shared/types';
import { MODULE_NAMES } from '../shared/types';
import {
  BookOpen,
  Lightbulb,
  Star,
  Code,
  Beaker,
  Bot,
  BarChart3,
  FileText,
  ClipboardCheck,
  CheckCircle2,
  Loader2,
  Circle,
  XCircle,
} from 'lucide-react';

const moduleIcons: Record<ModuleId, React.ReactNode> = {
  M1: <BookOpen size={16} />,
  M2: <Lightbulb size={16} />,
  M3: <Star size={16} />,
  M4: <Code size={16} />,
  M5: <Beaker size={16} />,
  M6: <Bot size={16} />,
  M7: <BarChart3 size={16} />,
  M8: <FileText size={16} />,
  M9: <ClipboardCheck size={16} />,
};

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={16} className="text-green-500" />;
    case 'running':
      return <Loader2 size={16} className="text-[#10a37f] animate-spin" />;
    case 'failed':
      return <XCircle size={16} className="text-red-500" />;
    default:
      return <Circle size={16} className="text-gray-300 dark:text-gray-600" />;
  }
}

export default function ModuleProgress({ module }: { module: ModuleProgressType }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors
      ${module.status === 'running' ? 'bg-[#10a37f]/5 dark:bg-[#10a37f]/10' : ''}
      ${module.status === 'completed' ? 'bg-green-50/40 dark:bg-green-900/10' : ''}
      ${module.status === 'failed' ? 'bg-red-50/40 dark:bg-red-900/10' : ''}
    `}>
      <div className="shrink-0 text-[#666] dark:text-[#999]">
        {moduleIcons[module.module_id]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">
            {module.module_id} {MODULE_NAMES[module.module_id]}
          </span>
          <StatusIcon status={module.status} />
        </div>
        {module.status === 'running' && (
          <>
            <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#10a37f] rounded-full transition-all duration-500"
                style={{ width: `${module.percent}%` }}
              />
            </div>
            <p className="text-xs text-[#999] mt-1 truncate">{module.message}</p>
          </>
        )}
        {module.status === 'completed' && (
          <p className="text-xs text-green-600 dark:text-green-400">已完成</p>
        )}
        {module.status === 'failed' && (
          <p className="text-xs text-red-500 truncate">{module.message || '执行失败'}</p>
        )}
      </div>
    </div>
  );
}
