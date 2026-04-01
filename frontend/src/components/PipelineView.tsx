import type { ModuleProgress, ModuleId } from '../shared/types';
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
  RotateCcw,
} from 'lucide-react';

const moduleIcons: Record<ModuleId, React.ReactNode> = {
  M1: <BookOpen size={18} />,
  M2: <Lightbulb size={18} />,
  M3: <Star size={18} />,
  M4: <Code size={18} />,
  M5: <Beaker size={18} />,
  M6: <Bot size={18} />,
  M7: <BarChart3 size={18} />,
  M8: <FileText size={18} />,
  M9: <ClipboardCheck size={18} />,
};

function NodeStatus({ status }: { status: string }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 size={12} className="text-green-500" />;
    case 'running':
      return <Loader2 size={12} className="text-blue-500 animate-spin" />;
    case 'failed':
      return <XCircle size={12} className="text-red-500" />;
    default:
      return <Circle size={12} className="text-gray-300" />;
  }
}

function getNodeStyle(status: string) {
  switch (status) {
    case 'completed':
      return 'border-green-300 bg-green-50 text-green-700';
    case 'running':
      return 'border-blue-300 bg-blue-50 text-blue-700 ring-2 ring-blue-200';
    case 'failed':
      return 'border-red-300 bg-red-50 text-red-700';
    default:
      return 'border-gray-200 bg-white text-gray-400';
  }
}

function getLineStyle(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-green-400';
    case 'running':
      return 'bg-blue-400 animate-pulse';
    default:
      return 'bg-gray-200';
  }
}

export default function PipelineView({ modules }: { modules: ModuleProgress[] }) {
  // Split into two rows: M1-M5 and M6-M9
  const row1 = modules.slice(0, 5);
  const row2 = modules.slice(5);

  // Check if M7 has retry (back to M6)
  const m7 = modules.find((m) => m.module_id === 'M7');
  const showRetry = m7?.status === 'failed';

  return (
    <div className="py-4">
      {/* Row 1: M1 -> M5 */}
      <div className="flex items-center justify-center gap-0 mb-4 overflow-x-auto px-2">
        {row1.map((m, i) => (
          <div key={m.module_id} className="flex items-center">
            <div className={`flex flex-col items-center gap-1.5 px-2 py-2 rounded-xl border transition-all min-w-[72px] ${getNodeStyle(m.status)}`}>
              <div className="flex items-center gap-1">
                {moduleIcons[m.module_id]}
                <NodeStatus status={m.status} />
              </div>
              <span className="text-[10px] font-medium whitespace-nowrap">
                {MODULE_NAMES[m.module_id]}
              </span>
              {m.status === 'running' && (
                <span className="text-[9px] opacity-70">{Math.round(m.percent)}%</span>
              )}
            </div>
            {i < row1.length - 1 && (
              <div className={`w-6 h-0.5 shrink-0 ${getLineStyle(row1[i + 1]?.status === 'waiting' ? 'waiting' : row1[i]?.status)}`} />
            )}
          </div>
        ))}
      </div>

      {/* Connector from row1 to row2 */}
      <div className="flex justify-center mb-4">
        <div className={`w-0.5 h-6 ${getLineStyle(row1[row1.length - 1]?.status)}`} />
      </div>

      {/* Row 2: M6 -> M9 */}
      <div className="flex items-center justify-center gap-0 overflow-x-auto px-2">
        {row2.map((m, i) => (
          <div key={m.module_id} className="flex items-center">
            <div className={`flex flex-col items-center gap-1.5 px-2 py-2 rounded-xl border transition-all min-w-[72px] ${getNodeStyle(m.status)}`}>
              <div className="flex items-center gap-1">
                {moduleIcons[m.module_id]}
                <NodeStatus status={m.status} />
              </div>
              <span className="text-[10px] font-medium whitespace-nowrap">
                {MODULE_NAMES[m.module_id]}
              </span>
              {m.status === 'running' && (
                <span className="text-[9px] opacity-70">{Math.round(m.percent)}%</span>
              )}
            </div>
            {i < row2.length - 1 && (
              <div className={`w-6 h-0.5 shrink-0 ${getLineStyle(row2[i + 1]?.status === 'waiting' ? 'waiting' : row2[i]?.status)}`} />
            )}
          </div>
        ))}
      </div>

      {/* Retry indicator */}
      {showRetry && (
        <div className="flex items-center justify-center gap-2 mt-3 text-xs text-orange-500">
          <RotateCcw size={12} />
          <span>M7 结果未达标，回退至 M6 重新实验</span>
        </div>
      )}
    </div>
  );
}
