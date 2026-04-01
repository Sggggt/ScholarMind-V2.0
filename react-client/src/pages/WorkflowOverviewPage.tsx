import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { EditorialPage, SectionBlock, StatusBadge, TimelineFlow } from '../components/ui/Primitives';

export default function WorkflowOverviewPage() {
  const navigate = useNavigate();
  const stages = useWorkspaceStore((state) => state.stages);
  const openStage = useWorkspaceStore((state) => state.openStage);

  return (
    <EditorialPage
      eyebrow="流程总览"
      title="把研究流程按顺序展开，而不是拆成离散页面"
      description="每个阶段都显示依赖关系、当前状态与下游承接，帮助用户快速理解研究连续性。"
    >
      <SectionBlock title="阶段时间线" description="系统通过前一阶段产物进入下一阶段的方式表达研究连续性。">
        <div className="timeline">
          {stages.map((stage, index) => (
            <button
              key={stage.id}
              className="timeline-item"
              onClick={() => {
                openStage(stage.id);
                navigate(stage.path);
              }}
              style={{ background: 'transparent', textAlign: 'left' }}
              type="button"
            >
              <div className="kicker">{String(index + 1).padStart(2, '0')}</div>
              <div className="timeline-dot" />
              <div className="timeline-copy">
                <div className="space-between">
                  <strong>{stage.title}</strong>
                  <StatusBadge status={stage.status} />
                </div>
                <div className="tiny muted">{stage.summary}</div>
              </div>
            </button>
          ))}
        </div>
      </SectionBlock>

      <div className="grid-two">
        <SectionBlock title="阶段状态" description="这一套状态模型会被侧边栏、流程页与页面头部共同使用。">
          <TimelineFlow
            items={[
              { year: '01', title: '未开始', summary: '该阶段尚未进入。' },
              { year: '02', title: '进行中', summary: '该阶段正在处理并持续产出结果。' },
              { year: '03', title: '已完成', summary: '该阶段关键产物已满足下游使用条件。' },
              { year: '04', title: '风险', summary: '该阶段存在异常、证据不足或仍需人工判断。' },
            ]}
          />
        </SectionBlock>

        <SectionBlock title="当前焦点" description="默认会话当前处于趋势分析阶段。">
          <div className="metric-card">
            <div className="kicker">当前阶段</div>
            <div className="metric-value">趋势分析</div>
            <div className="tiny muted">当前最合理的下一步是把趋势结论推进成明确的研究缺口。</div>
          </div>
        </SectionBlock>
      </div>
    </EditorialPage>
  );
}
