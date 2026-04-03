import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { EditorialPage, ProcessStepper, RunLogStream, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { sanitizeErrorMessage } from '../utils/errorMessage';

const runStatusLabelMap = {
  idle: '待命',
  running: '正在研究',
  paused: '已暂停',
  review: '待人工评审',
  completed: '已完成',
  failed: '执行失败',
  aborted: '已终止',
} as const;

function isTaskFinished(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'aborted';
}

export default function AgentRunPage() {
  const navigate = useNavigate();
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const currentTask = useWorkspaceStore((state) => state.currentTask);
  const runSteps = useWorkspaceStore((state) => state.runSteps);
  const runLogs = useWorkspaceStore((state) => state.runLogs);
  const runLogsBySession = useWorkspaceStore((state) => state.runLogsBySession);
  const runProgress = useWorkspaceStore((state) => state.runProgress);
  const runStatus = useWorkspaceStore((state) => state.runStatus);
  const refreshCurrentTask = useWorkspaceStore((state) => state.refreshCurrentTask);
  const refreshLogs = useWorkspaceStore((state) => state.refreshLogs);
  const taskError = useWorkspaceStore((state) => state.taskError);

  useEffect(() => {
    if (!currentTaskId) {
      return;
    }

    const hasCachedLogs = (runLogsBySession[currentTaskId] ?? []).length > 0;

    if (!currentTask) {
      void refreshCurrentTask({ background: true });
    }

    if (!hasCachedLogs) {
      void refreshLogs(currentTaskId);
    }
  }, [currentTask, currentTaskId, refreshCurrentTask, refreshLogs, runLogsBySession]);

  return (
    <EditorialPage
      eyebrow="Live Orchestration"
      title="实时查看多阶段研究任务的执行状态"
      description="这一页直接映射后端 orchestrator 的真实运行过程。左侧是模块阶段，右侧是日志流，页头统一提供重启、暂停、恢复与终止控制。"
      actions={
        runProgress >= 100 && runStatus === 'completed' ? (
          <button className="button-primary" onClick={() => navigate('/results')} type="button">
            查看结果分析
          </button>
        ) : !isTaskFinished(runStatus) ? (
          <StatusBadge status="in-progress" label={runStatusLabelMap[runStatus]} />
        ) : undefined
      }
    >
      <div className="cockpit-canvas">
        <div className="stack">
          <SectionBlock
            title={currentTask?.title ?? '当前暂无活动任务'}
            description={currentTask?.topic ?? '回到工作台创建研究任务后，这里会同步真实运行信息。'}
          >
            <div className="progress-container-modern">
              <div className="progress-header">
                <span className="progress-percent">{runProgress}%</span>
                <span className="tiny muted">{runStatusLabelMap[runStatus]}</span>
              </div>
              <div className="progress-track-modern">
                <div className="progress-fill-modern" style={{ width: `${runProgress}%` }} />
              </div>
            </div>
          </SectionBlock>

          <SectionBlock title="阶段推进" description="每个模块节点都来自当前任务的真实模块进度状态。">
            <ProcessStepper items={runSteps} />
          </SectionBlock>
        </div>

        <SectionBlock title="实时日志流" description="保留低干扰的终端感，但信息仍以可扫描为第一优先级。">
          <div className="terminal-glass">
            <div className="terminal-header-academic">
              <div className="dot-group">
                <div className="dot red" />
                <div className="dot yellow" />
                <div className="dot green" />
              </div>
              <div className="terminal-title">ScholarMind Trace Stream</div>
            </div>
            <div className="terminal-body-academic">
              {runLogs.length ? <RunLogStream logs={runLogs} /> : <div className="terminal-placeholder">等待 orchestrator 输出日志...</div>}
            </div>
          </div>
          {taskError ? <div className="inline-error-fixed">{sanitizeErrorMessage(taskError, '任务执行失败，请稍后重试。')}</div> : null}
        </SectionBlock>
      </div>
    </EditorialPage>
  );
}
