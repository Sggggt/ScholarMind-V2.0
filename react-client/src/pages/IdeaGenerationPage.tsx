import { ArrowRight, CheckCircle2, ListChecks, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EditorialPage, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { adaptIdeaArtifacts } from '../adapters/artifactAdapter';
import { getArtifactContent } from '../services/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function IdeaGenerationPage() {
  const navigate = useNavigate();
  const currentSessionId = useWorkspaceStore((state) => state.currentSessionId);
  const selectedIdeaIds = useWorkspaceStore((state) => state.selectedIdeaIds);
  const setSelectedIdeas = useWorkspaceStore((state) => state.setSelectedIdeas);
  const [ideas, setIdeas] = useState<Array<any>>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentSessionId) {
      setIdeas([]);
      setSelectedIdeas([]);
      setError(null);
      return;
    }

    let cancelled = false;

    const loadIdeas = async () => {
      try {
        const response = await getArtifactContent(currentSessionId, 'm3_scored_ideas.json');
        if (cancelled) {
          return;
        }

        const nextIdeas = adaptIdeaArtifacts(response.content);
        setIdeas(nextIdeas);
        setError(null);
      } catch (artifactError) {
        if (!cancelled) {
          setError(artifactError instanceof Error ? artifactError.message : '尚未生成可采纳的方案。');
        }
      }
    };

    void loadIdeas();

    return () => {
      cancelled = true;
    };
  }, [currentSessionId, setSelectedIdeas]);

  const toggleIdea = (id: string) => {
    const next = selectedIdeaIds.includes(id)
      ? selectedIdeaIds.filter((item) => item !== id)
      : [...selectedIdeaIds, id];
    setSelectedIdeas(next);
  };

  return (
    <EditorialPage
      eyebrow="Idea Evaluation"
      title="对候选研究方案做筛选，而不是堆叠卡片"
      description={
        error ??
        (selectedIdeaIds.length
          ? `已选择 ${selectedIdeaIds.length} 个方案，可以继续推进到代码仓库与实验阶段。`
          : '从真实评分结果中筛选一个或多个方向，决定哪条路线值得继续投入。')
      }
      actions={
        ideas.length ? (
          <div className="chip-row">
            <button className="button-secondary" onClick={() => setSelectedIdeas(ideas.map((idea) => idea.id))} type="button">
              <ListChecks size={14} />
              全选
            </button>
            <button className="button-ghost" onClick={() => setSelectedIdeas([])} type="button">
              <RotateCcw size={14} />
              清空
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="idea-list">
        {!ideas.length && !error ? <div className="empty-state">正在加载想法评分结果...</div> : null}
        {ideas.map((idea) => {
          const selected = selectedIdeaIds.includes(idea.id);

          return (
            <SectionBlock
              key={idea.id}
              title={idea.title}
              description={idea.premise}
              action={
                <StatusBadge
                  status={selected ? 'completed' : idea.recommended ? 'in-progress' : 'not-started'}
                  label={selected ? '已采纳' : idea.recommended ? '推荐' : '候选'}
                />
              }
            >
              <div className="radar-placeholder">
                <div className="radar-metric">
                  <span className="tiny muted">创新性</span>
                  <strong>{idea.innovation.toFixed(1)}</strong>
                </div>
                <div className="radar-metric">
                  <span className="tiny muted">可行性</span>
                  <strong>{idea.feasibility.toFixed(1)}</strong>
                </div>
                <div className="radar-metric">
                  <span className="tiny muted">证据强度</span>
                  <strong>{idea.evidenceStrength.toFixed(1)}</strong>
                </div>
                <div className="radar-metric">
                  <span className="tiny muted">风险指数</span>
                  <strong>{idea.risk.toFixed(1)}</strong>
                </div>
              </div>
              <div className="toolbar-row" style={{ marginTop: '18px' }}>
                <button
                  className={selected ? 'button-secondary' : 'button-primary'}
                  onClick={() => toggleIdea(idea.id)}
                  type="button"
                >
                  {selected ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
                  {selected ? '取消采纳' : '采纳该思路'}
                </button>
              </div>
            </SectionBlock>
          );
        })}
      </div>

      {selectedIdeaIds.length ? (
        <div className="primary-float">
          <button className="button-primary" onClick={() => navigate('/repository')} type="button">
            <ArrowRight size={14} />
            继续到代码仓库（已选 {selectedIdeaIds.length}）
          </button>
        </div>
      ) : null}
    </EditorialPage>
  );
}
