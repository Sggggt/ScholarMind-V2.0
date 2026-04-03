import { Pause, Play, RotateCcw, Square } from 'lucide-react';
import type { ReactNode } from 'react';
import { buildTaskControlActions, getModuleStageMeta, getTaskStatusLabel } from '../../adapters/taskAdapter';
import type { TaskCommand } from '../../types/app';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

const commandIconMap: Record<TaskCommand, typeof Pause> = {
  pause: Pause,
  resume: Play,
  abort: Square,
  restart: RotateCcw,
};

function TaskActionButtons({
  className,
  emptyState = null,
}: {
  className?: string;
  emptyState?: ReactNode;
}) {
  const currentTask = useWorkspaceStore((state) => state.currentTask);
  const runStatus = useWorkspaceStore((state) => state.runStatus);
  const isTaskLoading = useWorkspaceStore((state) => state.isTaskLoading);
  const executeTaskCommand = useWorkspaceStore((state) => state.executeTaskCommand);

  if (!currentTask) {
    return emptyState;
  }

  const actions = buildTaskControlActions(runStatus);
  if (!actions.length) {
    return emptyState;
  }

  return (
    <div className={className}>
      {actions.map((action) => {
        const command = action.command;
        if (!command) {
          return null;
        }

        const Icon = commandIconMap[command];
        return (
          <button
            key={command}
            className={`cmd-btn${command === 'abort' ? ' danger' : ''}`}
            disabled={isTaskLoading}
            onClick={() => void executeTaskCommand(command)}
            type="button"
          >
            <Icon size={14} />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

export function WorkflowTaskActions() {
  return <TaskActionButtons className="workflow-task-actions" />;
}

export default function TaskCommandBar() {
  const currentTask = useWorkspaceStore((state) => state.currentTask);
  const runStatus = useWorkspaceStore((state) => state.runStatus);
  const runProgress = useWorkspaceStore((state) => state.runProgress);

  if (!currentTask) {
    return null;
  }

  const currentModule = getModuleStageMeta(currentTask.current_module);
  const isRunning = runStatus === 'running';

  return (
    <div className="task-command-bar">
      <div className="task-command-bar-copy">
        <div className="task-command-bar-title-row">
          <span className="kicker">任务控制</span>
          <span className="task-command-bar-progress">{runProgress}%</span>
        </div>
        <strong className="task-command-bar-title">{currentTask.title}</strong>
        <div className="task-command-bar-meta">
          {isRunning ? (
            <span className="task-running-indicator">
              <span className="task-running-indicator-dot" />
              正在执行
            </span>
          ) : null}
          <span>{currentModule?.title ?? '领域探索'}</span>
          <span className="task-command-bar-divider" />
          <span>{getTaskStatusLabel(runStatus)}</span>
        </div>
      </div>

      <TaskActionButtons className="task-command-bar-actions" />
    </div>
  );
}
