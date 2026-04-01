import { useEffect } from 'react';
import { EditorialPage, ProcessStepper, RunLogStream, SectionBlock } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function AgentRunPage() {
  const runSteps = useWorkspaceStore((state) => state.runSteps);
  const runLogs = useWorkspaceStore((state) => state.runLogs);
  const runProgress = useWorkspaceStore((state) => state.runProgress);
  const runStatus = useWorkspaceStore((state) => state.runStatus);
  const startRun = useWorkspaceStore((state) => state.startRun);
  const tickRun = useWorkspaceStore((state) => state.tickRun);

  useEffect(() => {
    if (runStatus !== 'running') return;

    const timer = window.setInterval(() => {
      tickRun();
    }, 900);

    return () => window.clearInterval(timer);
  }, [runStatus, tickRun]);

  return (
    <EditorialPage
      eyebrow="智能体运行"
      title="让多步骤执行和实时日志保持可读，而不是失控滚动"
      description="运行页重点展示进度、子任务状态、警告与异常，同时尽量保持界面安静。状态更新需要流动，但不应像终端噪声一样压过主要信息。"
      actions={
        <button className="button-primary" onClick={startRun} type="button">
          启动运行
        </button>
      }
    >
      <SectionBlock title="运行进度" description="流式状态更新保持克制和可读。">
        <div className="figure-header">
          <div>
            <div className="kicker">执行状态</div>
            <div className="section-title">当前完成度 {runProgress}%</div>
          </div>
          <div className="status-badge status-in-progress">{runStatus === 'completed' ? '已完成' : '运行中'}</div>
        </div>
        <div className="progress-track" style={{ marginTop: 18 }}>
          <div className="progress-fill" style={{ width: `${runProgress}%` }} />
        </div>
      </SectionBlock>

      <div className="grid-two">
        <SectionBlock title="子任务状态" description="每个子任务都清楚显示当前阶段，但不过度堆叠细节。">
          <ProcessStepper items={runSteps} />
        </SectionBlock>

        <SectionBlock title="运行日志" description="警告保持可见，同时日志整体仍然像文档一样可读。">
          <RunLogStream logs={runLogs} />
        </SectionBlock>
      </div>
    </EditorialPage>
  );
}
