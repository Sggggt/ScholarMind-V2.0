import { ArrowRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DecisionRail, EditorialPage, SectionBlock, SideIndex, StatusBadge } from '../components/ui/Primitives';
import { adaptGapArtifacts } from '../adapters/artifactAdapter';
import { getArtifactContent } from '../services/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function ResearchGapsPage() {
  const navigate = useNavigate();
  const currentSessionId = useWorkspaceStore((state) => state.currentSessionId);
  const [gaps, setGaps] = useState<Array<any>>([]);
  const [activeGapId, setActiveGap] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentSessionId) {
      setGaps([]);
      setActiveGap('');
      setError(null);
      return;
    }

    let cancelled = false;

    const loadGaps = async () => {
      try {
        const response = await getArtifactContent(currentSessionId, 'm2_gap_analysis.json');
        if (cancelled) {
          return;
        }
        const nextGaps = adaptGapArtifacts(response.content);
        setGaps(nextGaps);
        setActiveGap(nextGaps[0]?.id ?? '');
        setError(null);
      } catch (artifactError) {
        if (!cancelled) {
          setError(artifactError instanceof Error ? artifactError.message : '研究缺口产物尚未生成。');
        }
      }
    };

    void loadGaps();

    return () => {
      cancelled = true;
    };
  }, [currentSessionId]);

  const activeGap = useMemo(() => gaps.find((gap) => gap.id === activeGapId) ?? gaps[0], [activeGapId, gaps]);

  return (
    <EditorialPage
      eyebrow="Research Gaps"
      title="在连续阅读布局中比较关键缺口与行动建议"
      description={error ?? '左侧切换缺口，中间阅读核心解释，右侧保留决策栏。目标是让诊断与下一步动作直接相连。'}
    >
      <div className="right-rail-layout">
        <SideIndex items={gaps} activeId={activeGapId} onChange={setActiveGap} />

        <div className="stack">
          <SectionBlock
            title={activeGap?.title ?? '暂无真实研究缺口'}
            description="每个缺口都需要同时交代重要性、风险与后续动作。"
            action={<StatusBadge status={activeGap ? 'in-progress' : 'not-started'} label={activeGap ? `评分 ${activeGap.score}` : '等待产物'} />}
          >
            <div className="stack">
              <div>
                <div className="kicker">为什么重要</div>
                <div>{activeGap?.whyItMatters ?? error ?? '当前任务还没有 gap 分析结果。'}</div>
              </div>
              <div>
                <div className="kicker">实施风险</div>
                <div>{activeGap?.risk ?? '等待风险说明。'}</div>
              </div>
              <div className="chip-row">
                {(activeGap?.tags ?? []).map((tag: string) => (
                  <span key={tag} className="chip active">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </SectionBlock>

          <SectionBlock title="下一步建议" description="建议动作必须可以直接推动后续阶段。">
            <div className="page-description">{activeGap?.recommendation ?? '先完成 M2 研究缺口分析。'}</div>
          </SectionBlock>
        </div>

        <DecisionRail
          title="决策栏"
          items={[
            {
              label: '推进到构思生成',
              description: '把当前缺口带入候选想法评估页，开始比较可执行方案。',
              action: (
                <button className="button-primary" onClick={() => navigate('/ideas')} type="button">
                  <ArrowRight size={14} />
                  推进
                </button>
              ),
            },
            {
              label: '标记为风险点',
              description: '如果证据不足，就继续保留在流程中，等待更多文献和实验支撑。',
              action: <StatusBadge status="risk" label="风险" />,
            },
          ]}
        />
      </div>
    </EditorialPage>
  );
}
