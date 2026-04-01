import { useNavigate } from 'react-router-dom';
import { DecisionRail, EditorialPage, SectionBlock, SideIndex, StatusBadge } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function ResearchGapsPage() {
  const navigate = useNavigate();
  const gaps = useWorkspaceStore((state) => state.researchGaps);
  const activeGapId = useWorkspaceStore((state) => state.activeGapId);
  const setActiveGap = useWorkspaceStore((state) => state.setActiveGap);
  const promoteGapToIdeas = useWorkspaceStore((state) => state.promoteGapToIdeas);

  const activeGap = gaps.find((gap) => gap.id === activeGapId) ?? gaps[0];

  return (
    <EditorialPage
      eyebrow="研究缺口"
      title="在低卡片化的连续布局中比较关键缺口"
      description="页面由左侧索引、中央焦点区和右侧决策栏组成，帮助用户从诊断直接推进到动作。"
    >
      <div className="right-rail-layout">
        <SideIndex items={gaps} activeId={activeGapId} onChange={setActiveGap} />

        <div className="stack">
          <SectionBlock
            title={activeGap.title}
            description="每个缺口都明确展示其重要性、风险和下一步建议。"
            action={<StatusBadge status="in-progress" label={`评分 ${activeGap.score}`} />}
          >
            <div className="stack">
              <div>
                <div className="kicker">为什么重要</div>
                <div>{activeGap.whyItMatters}</div>
              </div>
              <div>
                <div className="kicker">风险</div>
                <div>{activeGap.risk}</div>
              </div>
              <div className="chip-row">
                {activeGap.tags.map((tag) => (
                  <span key={tag} className="chip active">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </SectionBlock>

          <SectionBlock title="下一步建议" description="建议动作必须明确，而不是藏在边角说明里。">
            <div className="page-description">{activeGap.recommendation}</div>
          </SectionBlock>
        </div>

        <DecisionRail
          title="决策栏"
          items={[
            {
              label: '推进到想法生成',
              description: '把当前缺口直接带入候选想法比较页面。',
              action: (
                <button
                  className="button-primary"
                  onClick={() => {
                    promoteGapToIdeas(activeGap.id);
                    navigate('/ideas');
                  }}
                  type="button"
                >
                  推进
                </button>
              ),
            },
            {
              label: '标记为风险',
              description: '如果证据还不充分，就保持它在流程中持续可见。',
              action: <StatusBadge status="risk" label="风险" />,
            },
          ]}
        />
      </div>
    </EditorialPage>
  );
}
