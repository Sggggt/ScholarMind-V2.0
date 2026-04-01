import { useEffect, useMemo, useState } from 'react';
import { EditorialPage, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { adaptResultsArtifacts } from '../adapters/artifactAdapter';
import { getArtifactContent } from '../services/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

const metricLabelMap: Record<string, string> = {
  auc: 'AUC',
  cross_domain_gap: 'Cross-domain Gap',
  robustness_score: 'Robustness',
};

const normalizeMetric = (metric: string, value: string) => {
  if (metric === 'cross_domain_gap') {
    return Math.min(Math.abs(Number.parseFloat(value)), 20) * 5;
  }

  return Math.min(100, Math.max(0, Number.parseFloat(value) * 100));
};

export default function ResultsAnalysisPage() {
  const currentSessionId = useWorkspaceStore((state) => state.currentSessionId);
  const [results, setResults] = useState<Array<any>>([]);
  const [activeResultId, setActiveResultId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentSessionId) {
      setResults([]);
      setActiveResultId('');
      setError(null);
      return;
    }

    let cancelled = false;

    const loadResults = async () => {
      try {
        const response = await getArtifactContent(currentSessionId, 'm7_analysis.json');
        if (cancelled) {
          return;
        }

        const nextResults = adaptResultsArtifacts(response.content);
        setResults(nextResults);
        setActiveResultId(nextResults[0]?.id ?? '');
        setError(null);
      } catch (artifactError) {
        if (!cancelled) {
          setError(artifactError instanceof Error ? artifactError.message : '尚未生成结果分析产物。');
        }
      }
    };

    void loadResults();

    return () => {
      cancelled = true;
    };
  }, [currentSessionId]);

  const activeResult = useMemo(
    () => results.find((result) => result.id === activeResultId) ?? results[0],
    [activeResultId, results],
  );

  return (
    <EditorialPage
      eyebrow="Results Review"
      title="把指标、解释与错误案例放到一个可对照的结果页里"
      description={error ?? '这一页围绕真实分析产物展开，左上看实验切换，中部看指标，右侧和下方看解释与问题案例。'}
      actions={<StatusBadge status={activeResult ? 'completed' : 'not-started'} label={activeResult ? 'Analysis Ready' : 'Waiting'} />}
    >
      <SectionBlock title="实验切换" description="当前分析对象来自真实实验结果。">
        <div className="chip-row">
          {results.map((result) => (
            <button
              key={result.id}
              className={`chip${result.id === activeResultId ? ' active' : ''}`}
              onClick={() => setActiveResultId(result.id)}
              type="button"
            >
              {result.label}
            </button>
          ))}
        </div>
      </SectionBlock>

      <div className="grid-two">
        <SectionBlock title="指标对照" description="只展示分析文件中真实存在的指标。">
          <div className="comparison-chart">
            {Object.entries((activeResult?.metrics ?? {}) as Record<string, string>).map(([metric, value]) => (
              <div key={metric} className="comparison-row">
                <div className="comparison-label">{metricLabelMap[metric] ?? metric}</div>
                <div className="comparison-bar">
                  <div className="comparison-bar-fill" style={{ width: `${normalizeMetric(metric, value)}%` }} />
                </div>
                <div className="comparison-value">{value}</div>
              </div>
            ))}
            {!activeResult ? <div className="empty-state">暂无实验指标。</div> : null}
          </div>
        </SectionBlock>

        <SectionBlock title="结果解释" description="直接读取真实分析结论。">
          <p className="page-description">{activeResult?.interpretation ?? error ?? '暂无结果解释。'}</p>
        </SectionBlock>
      </div>

      <SectionBlock title="错误案例" description="展示当前实验产物中记录的问题样例。">
        <div className="ruled-list">
          {(activeResult?.errorCases ?? [error ?? '暂无错误案例。']).map((errorCase: string) => (
            <div key={errorCase} className="ruled-list-item">
              {errorCase}
            </div>
          ))}
        </div>
      </SectionBlock>
    </EditorialPage>
  );
}
