import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, ExternalLink, FileText, Maximize2, Minimize2 } from 'lucide-react';
import * as api from '../services/api';
import type { TaskOutput } from '../shared/types';

export default function PaperPreview({ taskId }: { taskId: string }) {
  const navigate = useNavigate();
  const [output, setOutput] = useState<TaskOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getTaskOutput(taskId)
      .then(setOutput)
      .catch(() => setOutput(null))
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 animate-fade-in">
        <div className="w-6 h-6 border-2 border-[#10a37f] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!output?.paper_url) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate(`/task/${taskId}`)} className="flex items-center gap-1.5 text-sm text-[#999] hover:text-[#0d0d0d] dark:hover:text-[#e5e5e5] transition-colors">
            <ArrowLeft size={16} />
            返回任务
          </button>
          <h2 className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">论文预览</h2>
        </div>
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#10a37f]/10 to-[#10a37f]/5 flex items-center justify-center mx-auto mb-4">
            <FileText size={28} className="text-[#10a37f]/40" />
          </div>
          <p className="text-sm font-medium text-[#666] dark:text-[#aaa]">论文尚未生成</p>
          <p className="text-xs text-[#999] mt-1.5">完成 M8 论文写作模块后将在此处预览和下载 PDF</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full animate-fade-in ${fullscreen ? 'fixed inset-0 z-40 bg-white dark:bg-[#1a1a2e] p-4' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {!fullscreen && (
            <button onClick={() => navigate(`/task/${taskId}`)} className="flex items-center gap-1.5 text-sm text-[#999] hover:text-[#0d0d0d] dark:hover:text-[#e5e5e5] transition-colors">
              <ArrowLeft size={16} />
              返回任务
            </button>
          )}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#10a37f] to-[#0d8a6c] flex items-center justify-center">
              <FileText size={14} className="text-white" />
            </div>
            <h2 className="text-sm font-semibold text-[#0d0d0d] dark:text-[#e5e5e5]">论文预览</h2>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={output.paper_url}
            download
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium text-white bg-[#10a37f] hover:bg-[#0d8a6c] transition-colors shadow-sm"
          >
            <Download size={12} />
            下载 PDF
          </a>
          <a
            href={output.paper_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg hover:bg-[#f4f4f4] dark:hover:bg-[#2a2a3e] text-[#999] transition-colors"
            title="新窗口打开"
          >
            <ExternalLink size={14} />
          </a>
          <button
            onClick={() => setFullscreen(!fullscreen)}
            className="p-2 rounded-lg hover:bg-[#f4f4f4] dark:hover:bg-[#2a2a3e] text-[#999] transition-colors"
            title={fullscreen ? '退出全屏' : '全屏'}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* PDF viewer */}
      <div className={`bg-[#f4f4f4] dark:bg-[#1e1e2e] rounded-2xl overflow-hidden shadow-sm border border-[#e5e5e5] dark:border-[#333] ${fullscreen ? 'flex-1' : 'flex-1 min-h-[400px]'}`}>
        <iframe
          src={output.paper_url}
          className="w-full h-full border-0"
          title="Paper Preview"
        />
      </div>

      {/* Figures */}
      {output.figures && output.figures.length > 0 && (
        <div className="mt-5">
          <h4 className="text-xs font-semibold text-[#999] uppercase tracking-wider mb-3">论文图表</h4>
          <div className="grid grid-cols-3 gap-3">
            {output.figures.map((fig, i) => (
              <div key={i} className="rounded-xl overflow-hidden border border-[#e5e5e5] dark:border-[#333] bg-white dark:bg-[#1e1e2e] shadow-sm hover:shadow-md transition-shadow">
                <img src={fig} alt={`Figure ${i + 1}`} className="w-full h-auto" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
