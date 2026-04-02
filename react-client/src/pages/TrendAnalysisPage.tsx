import { FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EditorialPage, SectionBlock, StatusBadge, TimelineFlow } from '../components/ui/Primitives';
import { adaptGapArtifacts, adaptLiteratureArtifacts, adaptTrendArtifacts } from '../adapters/artifactAdapter';
import { getArtifactContent } from '../services/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

function extractTrendMagnitude(title: string, index: number) {
  const match = title.match(/(\d+)/);
  if (match) {
    return Number(match[1]);
  }

  return index + 1;
}

export default function TrendAnalysisPage() {
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const currentTask = useWorkspaceStore((state) => state.currentTask);
  const [trendRange, setTrendRange] = useState<'3y' | '5y' | 'all'>('5y');
  const [trendEvents, setTrendEvents] = useState<Array<any>>([]);
  const [hotDirections, setHotDirections] = useState<string[]>([]);
  const [rankedPapers, setRankedPapers] = useState<Array<any>>([]);
  const [activeRankedPaperId, setActiveRankedPaper] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTaskId || !currentTask) {
      setTrendEvents([]);
      setHotDirections([]);
      setRankedPapers([]);
      setError(null);
      return;
    }

    let cancelled = false;

    const loadArtifacts = async () => {
      try {
        const [sourcesResponse, reviewResponse, gapResponse] = await Promise.all([
          getArtifactContent(currentTaskId, 'm1_sources.json'),
          getArtifactContent(currentTaskId, 'm1_literature_review.md'),
          getArtifactContent(currentTaskId, 'm2_gap_analysis.json').catch(() => null),
        ]);
        if (cancelled) {
          return;
        }

        const literature = adaptLiteratureArtifacts(
          currentTask.topic,
          String(reviewResponse.content ?? ''),
          sourcesResponse.content,
        );
        const gaps = gapResponse ? adaptGapArtifacts(gapResponse.content) : [];
        const trendData = adaptTrendArtifacts(literature.papers, gaps);

        setTrendEvents(trendData.trendEvents);
        setHotDirections(trendData.hotDirections);
        setRankedPapers(trendData.rankedPapers);
        setActiveRankedPaper(trendData.rankedPapers[0]?.id ?? '');
        setError(null);
      } catch (artifactError) {
        if (!cancelled) {
          setError(artifactError instanceof Error ? artifactError.message : '趋势产物尚未生成。');
        }
      }
    };

    void loadArtifacts();

    return () => {
      cancelled = true;
    };
  }, [currentTaskId, currentTask]);

  const filteredTrendEvents = useMemo(() => {
    if (trendRange === 'all') {
      return trendEvents;
    }

    const keep = trendRange === '3y' ? 3 : 5;
    return trendEvents.slice(-keep);
  }, [trendEvents, trendRange]);

  const activePaper = rankedPapers.find((paper) => paper.id === activeRankedPaperId) ?? rankedPapers[0];
  const trendSignals = useMemo(() => {
    const source = filteredTrendEvents.length ? filteredTrendEvents : [{ year: '--', title: '1 个信号', summary: '等待趋势数据' }];
    const magnitudes = source.map((event, index) => extractTrendMagnitude(String(event.title ?? ''), index));
    const maxMagnitude = Math.max(...magnitudes, 1);

    return source.map((event, index) => {
      const magnitude = magnitudes[index];
      return {
        year: String(event.year ?? '--'),
        count: magnitude,
        value: Math.max(18, Math.round((magnitude / maxMagnitude) * 100)),
        summary: String(event.summary ?? ''),
      };
    });
  }, [filteredTrendEvents]);

  return (
    <EditorialPage
      eyebrow="Trend Signals"
      title="把时间演化、热点方向与高价值论文放进同一张研究图板"
      description="趋势页不做 KPI 看板，而是以研究备忘录的方式展示：先看演化，再看热点，最后落到当前最值得继续跟踪的论文。"
      actions={<StatusBadge status={trendEvents.length ? 'completed' : 'not-started'} label={trendEvents.length ? 'Signals Ready' : 'Waiting'} />}
    >
      <SectionBlock title="主题演化" description="保留轻量时间轴和趋势柱形，帮助研究者快速判断演进方向。">
        <div className="chip-row" style={{ marginBottom: '20px' }}>
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
                <div className="trend-chart-bar-shell">
                  <div className="trend-chart-value" style={{ height: `${signal.value}%` }} />
                </div>
                <div className="trend-chart-count">{signal.count} 篇</div>
                <div className="trend-chart-year">{signal.year}</div>
              </div>
            ))}
          </div>
          <div className="figure-caption">{error ?? '趋势强度由当前已解析文献与缺口分析共同生成。'}</div>
        </div>

        <TimelineFlow items={filteredTrendEvents} />
      </SectionBlock>

      <div className="grid-two">
        <SectionBlock title="热点方向排序" description="只保留对下一步决策有帮助的方向。">
          <div className="ranked-list">
            {(hotDirections.length ? hotDirections : ['等待真实趋势产物']).map((direction, index) => (
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

        <SectionBlock title="重点论文排序" description="切换条目时，下方洞察会同步更新。">
          <div className="ranked-list">
            {rankedPapers.map((paper) => (
              <button
                key={paper.id}
                className={`ranked-row ranked-button${paper.id === activeRankedPaperId ? ' active' : ''}`}
                onClick={() => setActiveRankedPaper(paper.id)}
                type="button"
              >
                <div className="ranked-index">
                  <FileText size={14} />
                </div>
                <div className="ranked-copy">
                  <strong>{paper.title}</strong>
                  <div className="tiny muted">{paper.signal}</div>
                </div>
              </button>
            ))}
          </div>
        </SectionBlock>
      </div>

      <SectionBlock title="当前洞察" description="把排序判断收束成一句可执行结论。">
        <div className="figure-block">
          <div className="kicker">{activePaper?.signal ?? '等待重点论文'}</div>
          <div className="section-title" style={{ fontSize: '1.8rem', marginTop: '8px' }}>
            {activePaper?.title ?? '当前任务尚未形成重点论文排序'}
          </div>
          <p className="editorial-lead" style={{ marginTop: '14px' }}>
            {activePaper?.rationale ?? error ?? '完成文献与缺口产物后，这里会显示真实趋势结论。'}
          </p>
        </div>
      </SectionBlock>
    </EditorialPage>
  );
}
