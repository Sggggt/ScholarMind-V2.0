import type { ReviewDimension } from '../shared/types';

function ScoreBar({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = (score / maxScore) * 100;
  const color =
    pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-medium text-[#666] dark:text-[#aaa] w-12 text-right">
        {score}/{maxScore}
      </span>
    </div>
  );
}

export default function ReviewCard({ dimension }: { dimension: ReviewDimension }) {
  return (
    <div className="p-4 rounded-xl bg-[#f9f9f9] dark:bg-[#1e1e2e] border border-[#e5e5e5] dark:border-[#333]">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">{dimension.name}</h4>
      </div>
      <ScoreBar score={dimension.score} maxScore={dimension.max_score} />
      {dimension.comment && (
        <p className="text-xs text-[#666] dark:text-[#aaa] mt-2 leading-relaxed">{dimension.comment}</p>
      )}
    </div>
  );
}
