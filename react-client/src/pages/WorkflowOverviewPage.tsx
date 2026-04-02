import { AlertTriangle, ArrowUpRight, Check, Circle, LoaderCircle, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EditorialPage, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import AppIcon from '../components/ui/AppIcon';
import { routeMeta } from '../data/routeData';
import { resetTaskModule } from '../services/api';
import type { StageId } from '../types/app';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

const stageToModuleMap: Partial<Record<StageId, string>> = {
  literature: 'M1',
  gaps: 'M2',
  ideas: 'M3',
  repository: 'M4',
  experiment: 'M5',
  'agent-run': 'M6',
  results: 'M7',
  writing: 'M8',
  validation: 'M9',
};

function StageStatusIcon({ status }: { status: string }) {
  if (status === 'completed') {
    return <Check size={16} />;
  }
  if (status === 'in-progress') {
    return <LoaderCircle size={16} />;
  }
  if (status === 'risk') {
    return <AlertTriangle size={16} />;
  }
  return <Circle size={14} />;
}

export default function WorkflowOverviewPage() {
  const navigate = useNavigate();
  const stages = useWorkspaceStore((state) => state.stages);
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const openStage = useWorkspaceStore((state) => state.openStage);
  const refreshCurrentTask = useWorkspaceStore((state) => state.refreshCurrentTask);
  const showToast = useWorkspaceStore((state) => state.showToast);

  const handleResetStage = async (stageId: StageId) => {
    const moduleId = stageToModuleMap[stageId];

    if (!currentTaskId || !moduleId) {
      showToast('当前没有可重跑的任务阶段。');
      return;
    }

    try {
      const updatedTask = await resetTaskModule(currentTaskId, moduleId);

      if (!updatedTask) {
        showToast('阶段重跑入口已预留，当前仍需要后端 reset-module 接口支持。');
        return;
      }

      showToast(`已请求重跑 ${moduleId} 对应阶段。`);
      await refreshCurrentTask({ background: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : '阶段重跑失败');
    }
  };

  return (
    <EditorialPage
      eyebrow="Process Architecture"
      title="把十二个研究阶段组织成一条可阅读的学术流程线"
      description="这里不再使用厚重看板，而是像项目时间轴一样展示每个阶段的推进状态。你可以从任意节点继续进入对应页面。"
    >
      <SectionBlock
        title="阶段时间线"
        description="所有状态都来自当前任务的真实模块推进，主聊天页和流程页现在共用同一套任务控制入口。"
        action={<StatusBadge status={stages.some((stage) => stage.status === 'in-progress') ? 'in-progress' : 'not-started'} />}
      >
        <div className="stack">
          {stages.map((stage, index) => {
            const route = routeMeta.find((item) => item.id === stage.id);
            const canReset = stage.status === 'risk' || stage.status === 'completed';

            return (
              <article key={stage.id} className={`workflow-node${stage.status === 'risk' ? ' risk' : ''}`}>
                <button
                  className="workflow-node-main"
                  onClick={() => {
                    openStage(stage.id);
                    navigate(stage.path);
                  }}
                  type="button"
                >
                  <div className="space-between">
                    <div className="toolbar-row" style={{ alignItems: 'center' }}>
                      <span className="workflow-node-index">phase {String(index + 1).padStart(2, '0')}</span>
                      <span className={`sidebar-subitem-icon ${stage.status}`}>
                        <AppIcon name={route?.icon ?? 'MessagesSquare'} size={14} />
                      </span>
                      <span className="workflow-node-title">{stage.title}</span>
                    </div>
                    <div className="toolbar-row" style={{ alignItems: 'center' }}>
                      <StatusBadge status={stage.status} />
                      <ArrowUpRight size={15} />
                    </div>
                  </div>
                  <div className="toolbar-row workflow-node-summary" style={{ alignItems: 'center', marginTop: '10px' }}>
                    <StageStatusIcon status={stage.status} />
                    <span>{stage.summary}</span>
                  </div>
                </button>

                {canReset ? (
                  <div className="workflow-node-actions">
                    <button
                      className="workspace-shortcut-button"
                      onClick={() => void handleResetStage(stage.id)}
                      type="button"
                    >
                      <RotateCcw size={14} />
                      {stage.status === 'risk' ? '重试阶段' : '重跑本阶段'}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </SectionBlock>
    </EditorialPage>
  );
}
