import { useEffect, useMemo, useState } from 'react';
import { EditorialPage, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { adaptResultsArtifacts } from '../adapters/artifactAdapter';
import { getArtifactContent } from '../services/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { ExperimentResult } from '../types/app';

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
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const [results, setResults] = useState<Array<any>>([]);
  const [activeResultId, setActiveResultId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTaskId) {
      setResults([]);
      setActiveResultId('');
      setError(null);
      return;
    }

    let cancelled = false;

    const loadResults = async () => {
      try {
        const response = await getArtifactContent(currentTaskId, 'm7_analysis.json');
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
  }, [currentTaskId]);

  const activeResult = useMemo(
    () => results.find((result) => result.id === activeResultId) ?? results[0],
    [activeResultId, results],
  );

  return (
    <EditorialPage
      eyebrow="Results Review"
      title="实验结果分析"
      description={error ?? '查看实验指标对比、结果解释与关键发现。'}
      actions={<StatusBadge status={activeResult ? 'completed' : 'not-started'} label={activeResult ? 'Analysis Ready' : 'Waiting'} />}
    >
      <SectionBlock title="实验切换" description="选择要查看的实验结果。">
        <div className="chip-row">
          {results.map((result) => (
            <button
              key={result.id}
              className={`chip${result.id === activeResultId ? ' active' : ''}`}
              onClick={() => setActiveResultId(result.id)}
              type="button"
            >
              {result.label}
              {result.isSimulated && <span style={{ marginLeft: '6px', fontSize: '0.75em', opacity: 0.7 }}>(模拟)</span>}
            </button>
          ))}
        </div>
        {activeResult?.description && (
          <p className="page-description" style={{ marginTop: '8px', fontSize: '0.9em', opacity: 0.8 }}>
            {activeResult.description}
          </p>
        )}
      </SectionBlock>

      <div className="grid-two">
        <SectionBlock title="指标对照" description="真实实验指标对比。">
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
            {!activeResult || Object.keys(activeResult.metrics).length === 0 ? (
              <div className="empty-state">暂无实验指标。</div>
            ) : null}
          </div>
        </SectionBlock>

        <SectionBlock title="结果解释" description="当前实验的观察分析。">
          <p className="page-description">{activeResult?.interpretation ?? error ?? '暂无结果解释。'}</p>
        </SectionBlock>
      </div>

      <SectionBlock title="关键发现" description="实验分析中的核心发现。">
        <div className="ruled-list">
          {(activeResult?.errorCases ?? [error ?? '暂无关键发现。']).map((finding: string, idx: number) => (
            <div key={idx} className="ruled-list-item">
              {finding}
            </div>
          ))}
        </div>
      </SectionBlock>
    </EditorialPage>
  );
}