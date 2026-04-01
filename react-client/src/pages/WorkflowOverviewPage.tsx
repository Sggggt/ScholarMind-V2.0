import { AlertTriangle, ArrowUpRight, Check, Circle, LoaderCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EditorialPage, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { routeMeta } from '../data/routeData';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import AppIcon from '../components/ui/AppIcon';

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
  const openStage = useWorkspaceStore((state) => state.openStage);

  return (
    <EditorialPage
      eyebrow="Process Architecture"
      title="把十二个研究阶段组织成一条可阅读的学术流程线"
      description="这里不再使用厚重看板，而是像项目时间轴一样展示每一段研究工作。你可以从任何节点继续进入对应页面。"
    >
      <SectionBlock
        title="阶段时间线"
        description="所有状态都来自真实任务模块进度，布局只负责把它们排得更清楚。"
        action={<StatusBadge status={stages.some((stage) => stage.status === 'in-progress') ? 'in-progress' : 'not-started'} />}
      >
        <div className="stack">
          {stages.map((stage, index) => {
            const route = routeMeta.find((item) => item.id === stage.id);

            return (
              <button
                key={stage.id}
                className="workflow-node"
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
            );
          })}
        </div>
      </SectionBlock>
    </EditorialPage>
  );
}
