import { ChevronDown, ChevronUp } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EditorialPage, ProcessStepper, RunLogStream, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { sanitizeErrorMessage } from '../utils/errorMessage';

const runStatusLabelMap: Record<string, string> = {
  idle: '待命',
  running: '研究进行中',
  paused: '已暂停',
  review: '等待人工复核',
  completed: '已完成',
  failed: '执行失败',
  aborted: '已终止',
};

function isTaskFinished(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'aborted';
}

function readRecordValue(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  if (value == null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toChinesePhase(value: string) {
  const mapping: Record<string, string> = {
    m4: '代码准备',
    m5: '实验设计',
    m6: '实验执行',
  };
  return mapping[value] || value || '未开始';
}

function toChineseStatus(value: string) {
  const mapping: Record<string, string> = {
    running: '进行中',
    completed: '已完成',
    failed: '失败',
    pending: '待命',
    skipped: '已跳过',
    paused: '已暂停',
    review: '待复核',
    idle: '待命',
  };
  return mapping[value] || value || '未知';
}

function toChineseRole(value: string) {
  const mapping: Record<string, string> = {
    coordinator: '主控代理',
    'code-worker': '代码代理',
    'env-worker': '环境代理',
    'dataset-worker': '数据代理',
    'baseline-worker': '基线代理',
    'experiment-worker': '实验代理',
    'summary-worker': '摘要代理',
  };
  return mapping[value] || value || '未命名代理';
}

function translateAgentMessage(value: string) {
  const text = value.trim();
  if (!text) {
    return '';
  }

  const directMap: Record<string, string> = {
    'Coordinator is bootstrapping the code, environment, and baseline workers.': '主控代理正在统筹代码、环境和基线三个子任务。',
    'Coordinator is reviewing M4 outputs and deciding whether code changes are required.': '主控代理正在检查 M4 产物，并判断是否需要继续修改代码。',
    'Coordinator is dispatching experiment execution, repair, and summary workers.': '主控代理正在分派实验执行、修复和摘要整理任务。',
    'Environment worker is preparing the local baseline environment.': '环境代理正在准备本地基线运行环境。',
    'Environment worker prepared the baseline environment.': '环境代理已经完成本地基线环境准备。',
    'Environment worker is preparing the experiment execution environment.': '环境代理正在准备实验执行环境。',
    'Environment worker prepared the experiment execution environment.': '环境代理已经完成实验执行环境准备。',
    'Dataset worker skipped dedicated dataset staging because M4 is operating on an existing repository.': '数据代理判断当前复用已有仓库，因此跳过了独立的数据准备。',
    'Dataset worker skipped dedicated dataset staging because M4 uses the built-in baseline template bootstrap.': '数据代理判断当前使用内置基线模板启动，因此跳过了独立的数据准备。',
    'Baseline worker is executing run_0.': '基线代理正在执行 run_0。',
    'Baseline worker completed run_0 successfully.': '基线代理已经成功完成 run_0。',
    'Baseline worker failed to produce a successful run_0 result.': '基线代理未能产出成功的 run_0 结果。',
    'Code worker is generating the project repository and experiment implementation.': '代码代理正在生成项目仓库和实验实现。',
    'Code worker is updating the existing repository for the selected replacement idea.': '代码代理正在基于现有仓库改写选定的新想法。',
    'Code worker is updating experiment.py according to the experiment design plan.': '代码代理正在根据实验设计方案调整 experiment.py。',
    'Code worker finished aligning experiment.py with the experiment design plan.': '代码代理已经根据实验设计方案完成代码调整。',
    'Code worker finished generating the repository and baseline-ready experiment files.': '代码代理已经生成仓库和可运行的基线实验文件。',
    'Experiment worker is preparing to execute follow-up runs.': '实验代理正在准备后续实验运行。',
    'Experiment worker produced at least one successful follow-up run.': '实验代理已经产出至少一个成功的后续实验结果。',
    'Experiment worker exhausted the local run loop without a successful follow-up run.': '实验代理已经耗尽本地重试轮次，但仍未得到成功结果。',
    'M4 coordinator finished the bootstrap cycle.': '主控代理确认 M4 启动循环已经完成。',
    'M4 bootstrap completed in replacement mode.': '主控代理确认替换模式下的 M4 启动已经完成。',
    'M5 coordinator accepted the experiment design and handed the plan to M6.': '主控代理接受了实验设计，并已将方案交给 M6 执行。',
    'Git post-check completed after Aider run': 'Aider 完成后，Git 状态复查已经结束。',
    'Initialized multi-agent cycle': '多代理循环已经初始化。',
  };

  if (directMap[text]) {
    return directMap[text];
  }

  if (text.startsWith('Experiment worker started run_')) {
    return text.replace('Experiment worker started ', '实验代理已开始执行 ');
  }
  if (text.startsWith('Experiment worker completed run_')) {
    return text.replace('Experiment worker completed ', '实验代理已完成 ').replace(/\.$/, '。');
  }
  if (text.startsWith('run_') && text.includes('failed and has been compressed for coordinator review')) {
    return text.replace('failed and has been compressed for coordinator review.', ' 失败，错误信息已经压缩后反馈给主控代理。');
  }
  if (text.startsWith('Coordinator requested an in-place rollback to M4')) {
    return '主控代理决定原地回卷到 M4，准备重新规划下一轮代码与实验循环。';
  }
  if (text.startsWith('Git preflight detected stale index.lock and removed it')) {
    return 'Git 预检查发现旧的 index.lock，并已自动清理。';
  }
  if (text.startsWith('Git preflight detected active index.lock')) {
    return 'Git 预检查发现仍有活动中的 index.lock，已进入保护状态。';
  }

  return text;
}

function summaryLines(summary: Record<string, unknown> | null) {
  if (!summary) {
    return [] as string[];
  }

  const nested = (summary.summary as Record<string, unknown> | undefined) ?? null;
  const lines: string[] = [];
  const runNum = nested?.run_num ?? summary.run_num;
  const attempt = nested?.attempt ?? summary.attempt;
  const fingerprint = nested?.error_fingerprint ?? summary.error_fingerprint;
  const totalRuns = nested?.total_runs_planned ?? summary.total_runs_planned;
  const experimentCount = nested?.experiment_count ?? summary.experiment_count;

  if (runNum != null && String(runNum) !== '') {
    lines.push(`失败轮次：run_${String(runNum)}`);
  }
  if (attempt != null && String(attempt) !== '') {
    lines.push(`修复轮次：第 ${String(attempt)} 次`);
  }
  if (totalRuns != null && String(totalRuns) !== '') {
    lines.push(`计划实验数：${String(totalRuns)}`);
  }
  if (experimentCount != null && String(experimentCount) !== '') {
    lines.push(`当前实验项数：${String(experimentCount)}`);
  }
  if (fingerprint) {
    lines.push(`失败指纹：${String(fingerprint)}`);
  }

  return lines;
}

const agentStatusColor: Record<string, CSSProperties> = {
  running: { color: '#904d00', background: 'rgba(144, 77, 0, 0.1)' },
  completed: { color: '#4a6e4d', background: 'rgba(85, 117, 88, 0.12)' },
  failed: { color: '#9e422c', background: 'rgba(158, 66, 44, 0.1)' },
  pending: { color: '#78716c', background: 'rgba(92, 96, 93, 0.08)' },
  idle: { color: '#78716c', background: 'rgba(92, 96, 93, 0.08)' },
  paused: { color: '#78716c', background: 'rgba(92, 96, 93, 0.08)' },
  review: { color: '#6b5b00', background: 'rgba(180, 150, 0, 0.1)' },
  skipped: { color: '#a8a29e', background: 'rgba(92, 96, 93, 0.06)' },
};

function AgentStatusTag({ status }: { status: string }) {
  const label = toChineseStatus(status);
  const style = agentStatusColor[status];
  const isRunning = status === 'running';
  return (
    <span
      className={`agent-status-tag${isRunning ? ' agent-status-running' : ''}`}
      style={style ?? undefined}
    >
      {isRunning ? <span className="agent-status-dot" /> : null}
      {label}
    </span>
  );
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
  const activeCycle = (currentTask?.active_cycle ?? null) as Record<string, unknown> | null;
  const rootAgent = (currentTask?.root_agent ?? null) as Record<string, unknown> | null;
  const childAgents = Array.isArray(currentTask?.child_agents) ? (currentTask?.child_agents as Array<Record<string, unknown>>) : [];
  const recentSummary = (currentTask?.recent_summary ?? null) as Record<string, unknown> | null;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  const runtimeDescription = useMemo(() => {
    if (sidebarCollapsed) {
      return '展开后查看主控代理、子代理和最近压缩反馈。';
    }
    return '这里会同步显示主控代理判断、一级子代理状态，以及最近一次压缩反馈。';
  }, [sidebarCollapsed]);

  return (
    <EditorialPage
      eyebrow="实时编排"
      title="查看研究任务的实时执行"
      description="左侧是主阶段推进，中间是实时日志，最右侧的运行时边栏会持续展示多代理的最新判断。"
      actions={
        runProgress >= 100 && runStatus === 'completed' ? (
          <button className="button-primary" onClick={() => navigate('/results')} type="button">
            查看结果分析
          </button>
        ) : !isTaskFinished(runStatus) ? (
          <StatusBadge status="in-progress" label={runStatusLabelMap[runStatus] ?? runStatus} />
        ) : undefined
      }
    >
      <div className="cockpit-canvas cockpit-canvas-agent">
        <div className="stack">
          <SectionBlock
            title={currentTask?.title ?? '当前暂无活动任务'}
            description={currentTask?.topic ?? '回到工作台创建研究任务后，这里会同步显示真实运行信息。'}
          >
            <div className="progress-container-modern">
              <div className="progress-header">
                <span className="progress-percent">{runProgress}%</span>
                <span className="tiny muted">{runStatusLabelMap[runStatus] ?? runStatus}</span>
              </div>
              <div className="progress-track-modern">
                <div className="progress-fill-modern" style={{ width: `${runProgress}%` }} />
              </div>
            </div>
          </SectionBlock>

          <SectionBlock title="阶段推进" description="这里展示任务在 M4 到 M6 主阶段上的实际推进情况。">
            <ProcessStepper items={runSteps} />
          </SectionBlock>
        </div>

        <div className="stack">
          <SectionBlock title="实时日志流" description="保留终端式阅读体验，但内容已经按真实运行顺序同步。">
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
                {runLogs.length ? <RunLogStream logs={runLogs} /> : <div className="terminal-placeholder">等待后端推送新的运行日志...</div>}
              </div>
            </div>
            {taskError ? <div className="inline-error-fixed">{sanitizeErrorMessage(taskError, '任务执行失败，请稍后重试。')}</div> : null}
          </SectionBlock>
        </div>

        {(activeCycle || rootAgent || childAgents.length || recentSummary) ? (
          <aside className={`agent-runtime-sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
            <div className="agent-runtime-sidebar-shell">
              <div className="agent-runtime-header">
                <div className="agent-runtime-header-copy">
                  <div className="kicker">代理运行时</div>
                  <div className="tiny muted">{runtimeDescription}</div>
                </div>
                <button
                  aria-expanded={!sidebarCollapsed}
                  className="button-ghost agent-runtime-toggle"
                  onClick={() => setSidebarCollapsed((value) => !value)}
                  type="button"
                >
                  <span className={`agent-runtime-toggle-icon${sidebarCollapsed ? ' collapsed' : ''}`}>
                    {sidebarCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  </span>
                  <span className="agent-runtime-toggle-label">{sidebarCollapsed ? '展开' : '收起'}</span>
                </button>
              </div>

              <div className="agent-runtime-content">
                {activeCycle ? (
                  <div className="rail-item">
                    <strong>当前循环</strong>
                    <div className="tiny muted">当前阶段：{toChinesePhase(readRecordValue(activeCycle, 'phase'))}</div>
                    <div className="tiny muted">循环版本：第 {readRecordValue(activeCycle, 'cycle_revision') || '1'} 轮</div>
                    <div className="tiny muted">运行状态：<AgentStatusTag status={readRecordValue(activeCycle, 'status')} /></div>
                    <div className="tiny muted">项目目录：{readRecordValue(activeCycle, 'project_dir') || '暂未记录'}</div>
                  </div>
                ) : null}

                {rootAgent ? (
                  <div className="rail-item">
                    <strong>主控代理</strong>
                    <div className="tiny muted">当前状态：<AgentStatusTag status={readRecordValue(rootAgent, 'status')} /></div>
                    <div className="tiny">{translateAgentMessage(readRecordValue(rootAgent, 'last_message')) || '主控代理还没有给出新的自然语言判断。'}</div>
                  </div>
                ) : null}

                {childAgents.length ? (
                  <div className="rail-item">
                    <strong>一级子代理</strong>
                    <div className="stack">
                      {childAgents.map((agent, index) => (
                        <div className="agent-runtime-worker" key={`${readRecordValue(agent, 'agent_key')}-${index}`}>
                          <div className="space-between">
                            <span className="agent-runtime-worker-title">
                              {toChineseRole(readRecordValue(agent, 'role') || readRecordValue(agent, 'agent_key'))}
                            </span>
                            <AgentStatusTag status={readRecordValue(agent, 'status')} />
                          </div>
                          <div className="tiny muted">
                            {translateAgentMessage(readRecordValue(agent, 'last_message')) || '还没有新的工作回报。'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {recentSummary ? (
                  <div className="rail-item">
                    <strong>最近一次压缩反馈</strong>
                    <div className="tiny">{translateAgentMessage(readRecordValue(recentSummary, 'message')) || '还没有新的压缩摘要。'}</div>
                    <div className="stack">
                      {summaryLines(recentSummary).map((line, index) => (
                        <div className="tiny muted" key={`${line}-${index}`}>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </EditorialPage>
  );
}
