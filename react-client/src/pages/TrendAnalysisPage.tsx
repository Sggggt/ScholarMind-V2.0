import { FileText } from 'lucide-react';
import { EditorialPage, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

const trendSignals = [
  { year: '2021', value: 28 },
  { year: '2022', value: 44 },
  { year: '2024', value: 71 },
  { year: '2025', value: 84 },
];

export default function TrendAnalysisPage() {
  const trendEvents = useWorkspaceStore((state) => state.trendEvents);
  const hotDirections = useWorkspaceStore((state) => state.hotDirections);
  const rankedPapers = useWorkspaceStore((state) => state.rankedPapers);
  const activeRankedPaperId = useWorkspaceStore((state) => state.activeRankedPaperId);
  const setActiveRankedPaper = useWorkspaceStore((state) => state.setActiveRankedPaper);
  const trendRange = useWorkspaceStore((state) => state.trendRange);
  const setTrendRange = useWorkspaceStore((state) => state.setTrendRange);

  const activePaper = rankedPapers.find((paper) => paper.id === activeRankedPaperId) ?? rankedPapers[0];

  return (
    <EditorialPage
      eyebrow="趋势分析"
      title="把时间演化、热点方向与重点论文放在同一张研究图版里"
      description="这一页不做指标看板，而是像一份研究备忘录：先交代主题如何演化，再说明哪些方向持续升温，最后收束到当前最值得追踪的论文。"
      actions={<StatusBadge status="in-progress" label="进行中" />}
    >
      <SectionBlock title="主题演化" description="时间范围切换保持轻量，不打断阅读与判断。">
        <div className="chip-row" style={{ marginBottom: 20 }}>
          {(['3y', '5y', 'all'] as const).map((range) => (
            <button
              key={range}
              className={`chip${trendRange === range ? ' active' : ''}`}
              onClick={() => setTrendRange(range)}
              type="button"
            >
              {range}
            </button>
          ))}
        </div>

        <div className="trend-figure">
          <div className="trend-chart">
            {trendSignals.map((signal) => (
              <div key={signal.year} className="trend-chart-point">
                <div className="trend-chart-value" style={{ height: `${signal.value}%` }} />
                <div className="trend-chart-year">{signal.year}</div>
              </div>
            ))}
          </div>
          <div className="figure-caption">图 1. 研究主题从基础框架验证逐步转向异构稳健性与标签稀缺问题。</div>
        </div>

        <div className="timeline">
          {trendEvents.map((item) => (
            <div key={`${item.year}-${item.title}`} className="timeline-item">
              <div className="kicker">{item.year}</div>
              <div className="timeline-dot" />
              <div className="timeline-copy">
                <strong>{item.title}</strong>
                <div className="tiny muted">{item.summary}</div>
              </div>
            </div>
          ))}
        </div>
      </SectionBlock>

      <div className="grid-two">
        <SectionBlock title="热点方向排名" description="只保留真正有助于判断下一步的高信号方向。">
          <div className="ranked-list">
            {hotDirections.map((direction, index) => (
              <div key={direction} className="ranked-row">
                <div className="ranked-index">{index + 1}</div>
                <div className="ranked-copy">
                  <strong>{direction}</strong>
                  <div className="tiny muted">持续出现在趋势摘要与重点论文中。</div>
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>

        <SectionBlock title="重点论文排序" description="切换条目时，右下角洞察会同步更新。">
          <div className="ranked-list">
            {rankedPapers.map((paper) => (
              <button
                key={paper.id}
                className={`ranked-row ranked-button${paper.id === activeRankedPaperId ? ' active' : ''}`}
                onClick={() => setActiveRankedPaper(paper.id)}
                type="button"
              >
                <div className="ranked-index"><FileText size={14} /></div>
                <div className="ranked-copy" style={{ textAlign: 'left' }}>
                  <strong>{paper.title}</strong>
                  <div className="tiny muted">{paper.signal}</div>
                </div>
              </button>
            ))}
          </div>
        </SectionBlock>
      </div>

      <SectionBlock title="AI 洞察" description="把当前最有价值的排序判断收束成一句可执行结论。">
        <div className="figure-block">
          <div className="kicker">{activePaper.signal}</div>
          <div className="section-title" style={{ fontSize: 28, marginTop: 8 }}>
            {activePaper.title}
          </div>
          <p className="editorial-lead" style={{ marginTop: 14 }}>
            {activePaper.rationale}
          </p>
        </div>
      </SectionBlock>
    </EditorialPage>
  );
}
