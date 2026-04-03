import { ArrowRight, CheckCircle2, ListChecks, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EditorialPage, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { adaptIdeaArtifacts } from '../adapters/artifactAdapter';
import { ApiError, getArtifactContent, selectIdea } from '../services/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { sanitizeErrorMessage } from '../utils/errorMessage';

const IDEA_POLL_INTERVAL_MS = 1500;

export default function IdeaGenerationPage() {
  const navigate = useNavigate();
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const currentTask = useWorkspaceStore((state) => state.currentTask);
  const selectedIdeaIds = useWorkspaceStore((state) => state.selectedIdeaIds);
  const setSelectedIdeas = useWorkspaceStore((state) => state.setSelectedIdeas);
  const refreshCurrentTask = useWorkspaceStore((state) => state.refreshCurrentTask);
  const [ideas, setIdeas] = useState<Array<any>>([]);
  const [error, setError] = useState<string | null>(null);
  const [proceeding, setProceeding] = useState(false);

  const isGeneratingIdeas = currentTask?.status === 'running' && currentTask?.current_module === 'M3';
  const isM3Completed = currentTask?.status === 'paused' && currentTask?.current_module === 'M3' && ideas.length > 0;

  useEffect(() => {
    if (!currentTaskId) {
      setIdeas([]);
      setSelectedIdeas([]);
      setError(null);
      return;
    }

    setSelectedIdeas([]);
    setError(null);
  }, [currentTaskId, setSelectedIdeas]);

  useEffect(() => {
    if (!currentTaskId) {
      return;
    }

    let cancelled = false;
    let intervalId: number | undefined;

    const loadIdeas = async () => {
      try {
        const response = await getArtifactContent(currentTaskId, 'm3_scored_ideas.json');
        if (cancelled) {
          return;
        }

        setIdeas(adaptIdeaArtifacts(response.content));
        setError(null);
      } catch (artifactError) {
        if (cancelled) {
          return;
        }

        if (artifactError instanceof ApiError && artifactError.status === 404 && isGeneratingIdeas) {
          setError(null);
          return;
        }

        const rawMessage =
          artifactError instanceof Error ? artifactError.message : '想法评分结果暂时不可用，请稍后重试。';
        setError(sanitizeErrorMessage(rawMessage, '想法评分结果暂时不可用，请稍后重试。'));
      }
    };

    void loadIdeas();

    if (isGeneratingIdeas) {
      intervalId = window.setInterval(() => {
        void loadIdeas();
      }, IDEA_POLL_INTERVAL_MS);
    }

    return () => {
      cancelled = true;
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [currentTaskId, isGeneratingIdeas]);

  const toggleIdea = (id: string) => {
    const next = selectedIdeaIds.includes(id)
      ? selectedIdeaIds.filter((item) => item !== id)
      : [...selectedIdeaIds, id];
    setSelectedIdeas(next);
  };

  const handleProceed = async () => {
    if (!currentTaskId || selectedIdeaIds.length === 0 || proceeding) {
      return;
    }

    setProceeding(true);
    try {
      // 选择第一个选中的 idea 并推进到 M4
      const firstSelectedId = selectedIdeaIds[0];
      const ideaIndex = ideas.findIndex((idea) => idea.id === firstSelectedId);

      if (ideaIndex === -1) {
        setError('无法找到选中的 Idea');
        return;
      }

      await selectIdea(currentTaskId, ideaIndex);

      // 刷新任务状态并导航到代码生成页
      await refreshCurrentTask({ background: true });
      navigate('/repository');
    } catch (err) {
      const message = err instanceof Error ? err.message : '推进失败，请稍后重试';
      setError(sanitizeErrorMessage(message, '推进失败，请稍后重试'));
    } finally {
      setProceeding(false);
    }
  };

  const description =
    error ??
    (isM3Completed
      ? `Idea 生成已完成（共 ${ideas.length} 个），请选择方案后点击下方按钮推进到代码生成。`
      : selectedIdeaIds.length
        ? `已选择 ${selectedIdeaIds.length} 个方案，可以继续推进到代码生成与实验阶段。`
        : isGeneratingIdeas
          ? '正在生成并评分研究想法，新的候选方案会在产出后立即显示。'
          : '从真实评分结果中筛选一个或多个方向，决定哪条路线值得继续投入。');

  const emptyState = isGeneratingIdeas ? '正在等待第一个 idea 产出...' : '暂时还没有可展示的想法评分结果。';

  return (
    <EditorialPage
      eyebrow="Idea Evaluation"
      title="对候选研究方案做筛选，而不是堆叠卡片"
      description={description}
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
        {!ideas.length && !error ? <div className="empty-state">{emptyState}</div> : null}
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
                  <span className="tiny muted">吸引力</span>
                  <strong>{idea.evidenceStrength.toFixed(1)}</strong>
                </div>
                <div className="radar-metric">
                  <span className="tiny muted">风险</span>
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
          <button
            className="button-primary"
            disabled={proceeding}
            onClick={() => void handleProceed()}
            type="button"
          >
            <ArrowRight size={14} />
            {proceeding ? '正在推进...' : `继续到代码生成（已选 ${selectedIdeaIds.length}）`}
          </button>
        </div>
      ) : null}
    </EditorialPage>
  );
}
