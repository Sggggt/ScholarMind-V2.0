import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, Award, TrendingUp, MessageSquare } from 'lucide-react';
import { useTaskStore } from '../stores/taskStore';
import ReviewCard from '../components/ReviewCard';

export default function ReviewPanel({ taskId }: { taskId: string }) {
  const navigate = useNavigate();
  const { reviewResult, fetchReviewResult } = useTaskStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchReviewResult(taskId).finally(() => setLoading(false));
  }, [taskId, fetchReviewResult]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-[#10a37f] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isEmptyReview = !reviewResult || (reviewResult.overall_score === 0 && reviewResult.summary === '评审尚未完成');

  if (isEmptyReview) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(`/task/${taskId}`)} className="flex items-center gap-1.5 text-sm text-[#999] hover:text-[#0d0d0d] dark:hover:text-[#e5e5e5] transition-colors">
            <ArrowLeft size={16} />
            返回任务
          </button>
          <h2 className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">评审报告</h2>
        </div>
        <div className="text-center py-16">
          <BarChart3 size={48} className="mx-auto mb-4 text-[#d9d9d9]" />
          <p className="text-sm text-[#999]">评审尚未完成</p>
          <p className="text-xs text-[#ccc] mt-1">完成 M9 评审打分模块后将在此处显示</p>
        </div>
      </div>
    );
  }

  const decisionMap: Record<string, { label: string; color: string; bg: string }> = {
    accept: { label: 'Accept', color: 'text-green-700 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30' },
    weak_accept: { label: 'Weak Accept', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
    weak_reject: { label: 'Weak Reject', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20' },
    reject: { label: 'Reject', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
  };

  const decision = decisionMap[reviewResult.decision] || decisionMap.reject;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => navigate(`/task/${taskId}`)} className="flex items-center gap-1.5 text-sm text-[#999] hover:text-[#0d0d0d] dark:hover:text-[#e5e5e5] transition-colors">
          <ArrowLeft size={16} />
          返回任务
        </button>
        <h2 className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">评审报告</h2>
      </div>

      {/* Overall score card */}
      <div className="flex items-center gap-6 p-6 rounded-2xl bg-gradient-to-r from-[#f9f9f9] dark:from-[#1e1e2e] to-white dark:to-[#222238] border border-[#e5e5e5] dark:border-[#333]">
        <div className="text-center">
          <div className="text-4xl font-bold text-[#0d0d0d] dark:text-[#e5e5e5]">{reviewResult.overall_score}</div>
          <div className="text-xs text-[#999] mt-1">总分</div>
        </div>
        <div className="w-px h-12 bg-[#e5e5e5] dark:bg-[#444]" />
        <div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-semibold ${decision.color} ${decision.bg}`}>
            <Award size={14} />
            {decision.label}
          </span>
          <p className="text-xs text-[#999] mt-2">
            评审时间：{reviewResult.created_at ? new Date(reviewResult.created_at).toLocaleString('zh-CN') : '—'}
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="p-4 rounded-xl bg-[#f9f9f9] dark:bg-[#1e1e2e] border border-[#e5e5e5] dark:border-[#333]">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare size={14} className="text-[#10a37f]" />
          <h4 className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">评审总结</h4>
        </div>
        <p className="text-sm text-[#666] dark:text-[#aaa] leading-relaxed">{reviewResult.summary}</p>
      </div>

      {/* Dimension scores */}
      {reviewResult.dimensions.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-[#10a37f]" />
            <h4 className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">多维度评分</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {reviewResult.dimensions.map((d, i) => (
              <ReviewCard key={i} dimension={d} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
