interface MetricItem {
  label: string;
  value: number;
  unit?: string;
}

export default function ResultChart({ metrics }: { metrics: MetricItem[] }) {
  const maxVal = Math.max(...metrics.map((m) => m.value), 1);

  return (
    <div className="space-y-3">
      {metrics.map((m, i) => {
        const pct = (m.value / maxVal) * 100;
        return (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-[#0d0d0d] dark:text-[#e5e5e5]">{m.label}</span>
              <span className="text-sm font-medium text-[#0d0d0d] dark:text-[#e5e5e5]">
                {m.value}{m.unit || ''}
              </span>
            </div>
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#10a37f] rounded-full transition-all duration-700"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
