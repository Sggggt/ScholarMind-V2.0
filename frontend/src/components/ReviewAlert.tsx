import { useState } from 'react';
import { AlertCircle, Check, X, RotateCcw } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import { MODULE_NAMES } from '../shared/types';

export default function ReviewAlert() {
  const { needReviewData, submitReview, clearNeedReview } = useTaskStore();
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!needReviewData) return null;

  const handleAction = async (action: 'approve' | 'reject' | 'revise') => {
    setSubmitting(true);
    try {
      await submitReview(needReviewData.taskId, action, comment || undefined);
      setComment('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#1e1e2e] rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border border-transparent dark:border-[#333]">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[#e5e5e5] dark:border-[#333]">
          <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <AlertCircle size={16} className="text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#0d0d0d] dark:text-[#e5e5e5]">需要人工审阅</h3>
            <p className="text-xs text-[#999]">
              {MODULE_NAMES[needReviewData.module]} 模块产出需要您的确认
            </p>
          </div>
          <button
            onClick={clearNeedReview}
            className="ml-auto p-1 rounded-lg hover:bg-[#f4f4f4] dark:hover:bg-[#2a2a3e] text-[#999]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 max-h-60 overflow-y-auto">
          <pre className="text-sm text-[#333] dark:text-[#ccc] whitespace-pre-wrap bg-[#f9f9f9] dark:bg-[#222238] rounded-xl p-4 border border-[#e5e5e5] dark:border-[#333]">
            {typeof needReviewData.content === 'string'
              ? needReviewData.content
              : JSON.stringify(needReviewData.content, null, 2)}
          </pre>
        </div>

        {/* Comment */}
        <div className="px-6 pb-3">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="添加审阅意见（可选）..."
            className="w-full h-20 px-4 py-3 rounded-xl bg-[#f4f4f4] dark:bg-[#222238] border border-transparent focus:border-[#10a37f] focus:outline-none text-sm text-[#0d0d0d] dark:text-[#e5e5e5] resize-none placeholder:text-[#999]"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[#e5e5e5] dark:border-[#333] bg-[#f9f9f9] dark:bg-[#171720]">
          <button
            onClick={() => handleAction('reject')}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
          >
            <X size={14} />
            驳回
          </button>
          <button
            onClick={() => handleAction('revise')}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 transition-colors disabled:opacity-50"
          >
            <RotateCcw size={14} />
            修改
          </button>
          <button
            onClick={() => handleAction('approve')}
            disabled={submitting}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#10a37f] hover:bg-[#0d8a6c] transition-colors disabled:opacity-50"
          >
            <Check size={14} />
            批准
          </button>
        </div>
      </div>
    </div>
  );
}
