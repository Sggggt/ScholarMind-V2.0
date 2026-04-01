import { useNavigate } from 'react-router-dom';
import { EditorialPage, ResearchTable, SectionBlock } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function IdeaGenerationPage() {
  const navigate = useNavigate();
  const ideas = useWorkspaceStore((state) => state.ideas);
  const selectedIdeaId = useWorkspaceStore((state) => state.selectedIdeaId);
  const selectIdea = useWorkspaceStore((state) => state.selectIdea);

  return (
    <EditorialPage
      eyebrow="想法生成"
      title="围绕创新性、可行性、证据强度和风险比较候选想法"
      description="这一页承接已选研究缺口，把它转化为可比较、可推荐的候选方向矩阵。"
    >
      <SectionBlock title="候选想法矩阵" description="推荐方向会被突出，但仍然和其他方案共同比较。">
        <ResearchTable
          columns={[
            { key: 'idea', label: '想法' },
            { key: 'innovation', label: '创新性' },
            { key: 'feasibility', label: '可行性' },
            { key: 'evidence', label: '证据强度' },
            { key: 'risk', label: '风险' },
            { key: 'actions', label: '操作' },
          ]}
          rows={ideas.map((idea) => ({
            idea: (
              <div>
                <strong>{idea.title}</strong>
                <div className="tiny muted">{idea.premise}</div>
              </div>
            ),
            innovation: idea.innovation.toFixed(1),
            feasibility: idea.feasibility.toFixed(1),
            evidence: idea.evidenceStrength.toFixed(1),
            risk: idea.risk.toFixed(1),
            actions: (
              <button
                className={idea.id === selectedIdeaId ? 'button-primary' : 'button-secondary'}
                onClick={() => {
                  selectIdea(idea.id);
                  navigate('/repository');
                }}
                type="button"
              >
                {idea.id === selectedIdeaId ? '已选中' : '选择'}
              </button>
            ),
          }))}
        />
      </SectionBlock>
    </EditorialPage>
  );
}
