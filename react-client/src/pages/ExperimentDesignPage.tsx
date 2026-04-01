import { useNavigate } from 'react-router-dom';
import { EditorialPage, SectionBlock } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function ExperimentDesignPage() {
  const navigate = useNavigate();
  const experimentDesign = useWorkspaceStore((state) => state.experimentDesign);
  const updateExperimentDesign = useWorkspaceStore((state) => state.updateExperimentDesign);
  const saveExperimentDesign = useWorkspaceStore((state) => state.saveExperimentDesign);

  return (
    <EditorialPage
      eyebrow="实验设计"
      title="把数据集、模型、基线与指标组织成实验计划单"
      description="这一页更像实验计划单，而不是普通表单，重点是把假设与依赖关系明确出来。"
      actions={
        <button
          className="button-primary"
          onClick={() => {
            saveExperimentDesign();
            navigate('/agent-run');
          }}
          type="button"
        >
          保存方案
        </button>
      }
    >
      <SectionBlock title="核心假设" description="当前实验要验证的中心命题。">
        <textarea
          className="text-area"
          value={experimentDesign.hypothesis}
          onChange={(event) => updateExperimentDesign({ hypothesis: event.target.value })}
        />
      </SectionBlock>

      <div className="grid-two">
        <SectionBlock title="数据集与模型" description="存在依赖关系的配置放在同一工作面中。">
          <div className="stack">
            <label>
              <div className="kicker">数据集</div>
              <input
                className="text-input"
                value={experimentDesign.dataset}
                onChange={(event) => updateExperimentDesign({ dataset: event.target.value })}
              />
            </label>
            <label>
              <div className="kicker">模型</div>
              <input
                className="text-input"
                value={experimentDesign.model}
                onChange={(event) => updateExperimentDesign({ model: event.target.value })}
              />
            </label>
          </div>
        </SectionBlock>

        <SectionBlock title="基线、指标与运行条件" description="这一部分把验证条件明确写清楚。">
          <div className="stack">
            <label>
              <div className="kicker">基线</div>
              <input
                className="text-input"
                value={experimentDesign.baseline}
                onChange={(event) => updateExperimentDesign({ baseline: event.target.value })}
              />
            </label>
            <label>
              <div className="kicker">运行环境</div>
              <input
                className="text-input"
                value={experimentDesign.runtime}
                onChange={(event) => updateExperimentDesign({ runtime: event.target.value })}
              />
            </label>
          </div>
        </SectionBlock>
      </div>
    </EditorialPage>
  );
}
