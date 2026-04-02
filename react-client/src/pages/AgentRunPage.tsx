import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pause, Play, Square } from 'lucide-react';
import { EditorialPage, ProcessStepper, RunLogStream, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

const runStatusLabelMap = {
  idle: '待命',
  running: '正在研究',
  paused: '已暂停',
  review: '待人工评审',
  completed: '已完成',
  failed: '执行失败',
  aborted: '已终止',
} as const;

export default function AgentRunPage() {
  const navigate = useNavigate();
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const runSteps = useWorkspaceStore((state) => state.runSteps);
  const runLogs = useWorkspaceStore((state) => state.runLogs);
  const runLogsBySession = useWorkspaceStore((state) => state.runLogsBySession);
  const runProgress = useWorkspaceStore((state) => state.runProgress);
  const runStatus = useWorkspaceStore((state) => state.runStatus);
  const isTaskLoading = useWorkspaceStore((state) => state.isTaskLoading);
  const currentTask = useWorkspaceStore((state) => state.currentTask);
  const pauseCurrentTask = useWorkspaceStore((state) => state.pauseCurrentTask);
  const resumeCurrentTask = useWorkspaceStore((state) => state.resumeCurrentTask);
  const abortCurrentTask = useWorkspaceStore((state) => state.abortCurrentTask);
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
      description="这一页直接映射后端 orchestrator 的真实运行过程。左侧是模块阶段，右侧是日志流，顶部是当前任务总状态。"
      actions={
        runProgress >= 100 || runStatus === 'completed' ? (
          <button className="button-primary" onClick={() => navigate('/results')} type="button">
            查看结果分析
          </button>
        ) : (
          <StatusBadge
            status={runStatus === 'failed' || runStatus === 'aborted' ? 'risk' : 'in-progress'}
            label={runStatusLabelMap[runStatus]}
          />
        )
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

            <div className="control-button-group">
              {runStatus === 'running' ? (
                <button className="control-btn" onClick={() => void pauseCurrentTask()} disabled={isTaskLoading} type="button">
                  <Pause size={14} />
                  暂停
                </button>
              ) : null}
              {runStatus === 'paused' ? (
                <button className="control-btn primary" onClick={() => void resumeCurrentTask()} disabled={isTaskLoading} type="button">
                  <Play size={14} />
                  恢复
                </button>
              ) : null}
              {runStatus === 'running' || runStatus === 'paused' ? (
                <button
                  className="control-btn danger"
                  onClick={() => {
                    if (window.confirm('确认终止当前任务吗？')) {
                      void abortCurrentTask();
                    }
                  }}
                  disabled={isTaskLoading}
                  type="button"
                >
                  <Square size={14} />
                  终止
                </button>
              ) : null}
            </div>
          </SectionBlock>

          <SectionBlock title="阶段推进" description="每个模块节点都来自当前任务的模块进度状态。">
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
          {taskError ? <div className="inline-error-fixed">{taskError}</div> : null}
        </SectionBlock>
      </div>
    </EditorialPage>
  );
}
