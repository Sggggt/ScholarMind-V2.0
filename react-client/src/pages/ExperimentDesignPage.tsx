import { Bot } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EditorialPage, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { adaptExperimentPlan } from '../adapters/artifactAdapter';
import { getArtifactContent } from '../services/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

const emptyExperimentDesign = {
  dataset: '',
  model: '',
  baseline: '',
  metrics: [] as string[],
  runtime: '',
  hypothesis: '',
};

export default function ExperimentDesignPage() {
  const navigate = useNavigate();
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const [experimentDesign, setExperimentDesign] = useState(emptyExperimentDesign);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTaskId) {
      setExperimentDesign(emptyExperimentDesign);
      setError(null);
      return;
    }

    let cancelled = false;

    const loadPlan = async () => {
      try {
        const response = await getArtifactContent(currentTaskId, 'm5_experiment_plan.json');
        if (cancelled) {
          return;
        }
        setExperimentDesign(adaptExperimentPlan(response.content));
        setError(null);
      } catch (artifactError) {
        if (!cancelled) {
          setError(artifactError instanceof Error ? artifactError.message : '实验计划产物尚未生成。');
        }
      }
    };

    void loadPlan();

    return () => {
      cancelled = true;
    };
  }, [currentTaskId]);

  return (
    <EditorialPage
      eyebrow="Experiment Plan"
      title="把数据集、模型、基线与指标组织成可执行的实验设计单"
      description={error ?? '实验设计页更像研究计划书，而不是传统表单。重点是把假设、依赖和评估口径同时说清。'}
      actions={
        <button className="button-primary" onClick={() => navigate('/agent-run')} type="button">
          <Bot size={14} />
          查看运行页
        </button>
      }
    >
      <SectionBlock
        title="核心假设"
        description="这条假设定义了当前实验希望验证的中心命题。"
        action={<StatusBadge status={experimentDesign.hypothesis ? 'completed' : 'not-started'} />}
      >
        <textarea className="text-area" value={experimentDesign.hypothesis || '等待实验计划同步。'} readOnly />
      </SectionBlock>

      <div className="grid-two">
        <SectionBlock title="数据集与模型" description="决定实验边界和核心方法。">
          <div className="stack">
            <label className="form-row">
              <span className="form-label">数据集</span>
              <input className="text-input" value={experimentDesign.dataset} readOnly />
            </label>
            <label className="form-row">
              <span className="form-label">模型</span>
              <input className="text-input" value={experimentDesign.model} readOnly />
            </label>
          </div>
        </SectionBlock>

        <SectionBlock title="基线、指标与运行条件" description="这里明确评估标准与执行条件。">
          <div className="stack">
            <label className="form-row">
              <span className="form-label">基线</span>
              <input className="text-input" value={experimentDesign.baseline} readOnly />
            </label>
            <label className="form-row">
              <span className="form-label">运行环境</span>
              <input className="text-input" value={experimentDesign.runtime} readOnly />
            </label>
            <div className="chip-row">
              {(experimentDesign.metrics.length ? experimentDesign.metrics : ['等待指标']).map((metric) => (
                <span key={metric} className="chip active">
                  {metric}
                </span>
              ))}
            </div>
          </div>
        </SectionBlock>
      </div>
    </EditorialPage>
  );
}