import { EditorialPage, SectionBlock } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

const metricLabelMap: Record<string, string> = {
  auc: 'AUC',
  cross_domain_gap: '跨域差距',
  robustness_score: '鲁棒性得分',
};

const errorDistribution = [
  { label: '低标签中心', value: 46 },
  { label: '极端分布偏移', value: 31 },
  { label: '噪声样本', value: 23 },
];

function normalizeMetric(metric: string, value: string) {
  if (metric === 'cross_domain_gap') {
    return Math.min(Math.abs(Number.parseFloat(value)), 20) * 5;
  }

  return Number.parseFloat(value) * 100;
}

export default function ResultsAnalysisPage() {
  const results = useWorkspaceStore((state) => state.results);
  const activeResultId = useWorkspaceStore((state) => state.activeResultId);
  const setResult = useWorkspaceStore((state) => state.setResult);

  const activeResult = results.find((result) => result.id === activeResultId) ?? results[0];

  return (
    <EditorialPage
      eyebrow="结果分析"
      title="比较指标、解释结果，并把错误案例纳入同一份评审式分析"
      description="结果页应当像一页研究分析，而不是只剩几个数字。指标比较、误差分布和综合解释要在同一语境里成立。"
    >
      <SectionBlock title="实验对比" description="切换不同实验时，下面的图表与解释同步更新。">
        <div className="chip-row">
          {results.map((result) => (
            <button
              key={result.id}
              className={`chip${result.id === activeResultId ? ' active' : ''}`}
              onClick={() => setResult(result.id)}
              type="button"
            >
              {result.label}
            </button>
          ))}
        </div>
      </SectionBlock>

      <div className="grid-two">
        <SectionBlock title="指标对比图" description="采用接近论文图版的低噪声水平条，而不是花哨仪表盘。">
          <div className="comparison-chart">
            {Object.entries(activeResult.metrics).map(([metric, value]) => (
              <div key={metric} className="comparison-row">
                <div className="comparison-label">{metricLabelMap[metric] ?? metric}</div>
                <div className="comparison-bar">
                  <div
                    className="comparison-bar-fill"
                    style={{ width: `${Math.max(12, normalizeMetric(metric, value))}%` }}
                  />
                </div>
                <div className="comparison-value">{value}</div>
              </div>
            ))}
          </div>
          <div className="figure-caption">图 2. 当前方案在主指标与跨域差距上的综合表现。</div>
        </SectionBlock>

        <SectionBlock title="错误分布" description="错误案例分布只保留足够支撑决策的粗粒度结构。">
          <div className="comparison-chart">
            {errorDistribution.map((item) => (
              <div key={item.label} className="comparison-row">
                <div className="comparison-label">{item.label}</div>
                <div className="comparison-bar muted">
                  <div className="comparison-bar-fill secondary" style={{ width: `${item.value}%` }} />
                </div>
                <div className="comparison-value">{item.value}%</div>
              </div>
            ))}
          </div>
          <div className="figure-caption">图 3. 主要失效来源集中在低标签中心和极端分布偏移场景。</div>
        </SectionBlock>
      </div>

      <div className="grid-two">
        <SectionBlock title="结果解释" description="AI 综合判断始终贴着实验输出展开。">
          <p className="editorial-lead" style={{ marginTop: 0 }}>
            {activeResult.interpretation}
          </p>
        </SectionBlock>

        <SectionBlock title="错误案例摘录" description="失败分析属于主阅读面，而不是隐藏在附录里。">
          <div className="ruled-list">
            {activeResult.errorCases.map((errorCase) => (
              <div key={errorCase} className="ruled-list-item">
                {errorCase}
              </div>
            ))}
          </div>
        </SectionBlock>
      </div>
    </EditorialPage>
  );
}
