import {
  ArrowUpRight,
  BookOpen,
  Bot,
  FolderOpen,
  Paperclip,
  Pause,
  Play,
  RotateCcw,
  SendHorizonal,
  Settings2,
  Sparkles,
  Square,
  Target,
} from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLogo from '../components/ui/AppLogo';
import TaskCommandBar from '../components/ui/TaskCommandBar';
import type { ChatQuickAction, TaskCommand } from '../types/app';
import {
  clearWorkingDirectoryPreference,
  getDesktopSettings,
  saveWorkingDirectoryPreference,
} from '../services/preferences';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { sanitizeErrorMessage } from '../utils/errorMessage';

const promptSuggestions = [
  {
    title: '多中心医学影像',
    detail: '联邦学习的跨域泛化与标签噪声问题',
  },
  {
    title: 'AI for Science',
    detail: '评估大模型在科学发现中的关键局限',
  },
  {
    title: '可解释视觉模型',
    detail: '面向自动驾驶的 Transformer 结构创新',
  },
];

const runStatusLabelMap = {
  idle: '对话澄清',
  running: '任务执行中',
  paused: '任务已暂停',
  review: '等待评审',
  completed: '任务已完成',
  failed: '任务失败',
  aborted: '任务已终止',
} as const;

const commandIconMap: Record<TaskCommand, typeof Pause> = {
  pause: Pause,
  resume: Play,
  abort: Square,
  restart: RotateCcw,
};

function renderInlineMarkdown(text: string) {
  const segments = text.split('**');
  return segments.map((segment, index) =>
    index % 2 === 1 ? <strong key={`${segment}-${index}`}>{segment}</strong> : <Fragment key={`${segment}-${index}`}>{segment}</Fragment>,
  );
}

function renderMessageContent(content: string) {
  const lines = content.split('\n');

  return lines.map((line, index) => (
    <Fragment key={`${line}-${index}`}>
      {renderInlineMarkdown(line)}
      {index < lines.length - 1 ? <span className="line-break" /> : null}
    </Fragment>
  ));
}

function ActionButton({
  action,
  onNavigate,
  onCommand,
}: {
  action: ChatQuickAction;
  onNavigate: (path: string) => void;
  onCommand: (command: TaskCommand) => void;
}) {
  if (action.command) {
    const Icon = commandIconMap[action.command];

    return (
      <button
        key={`${action.label}-${action.command}`}
        className={`workspace-shortcut-button${action.command === 'abort' ? ' danger' : ''}`}
        onClick={() => onCommand(action.command!)}
        type="button"
      >
        <Icon size={14} />
        {action.label}
      </button>
    );
  }

  if (!action.path) {
    return null;
  }

  return (
    <button
      key={`${action.label}-${action.path}`}
      className="workspace-shortcut-button"
      onClick={() => onNavigate(action.path!)}
      type="button"
    >
      <ArrowUpRight size={14} />
      {action.label}
    </button>
  );
}

export default function MainChatWorkspacePage() {
  const navigate = useNavigate();
  const chatMessages = useWorkspaceStore((state) => state.chatMessages);
  const currentTask = useWorkspaceStore((state) => state.currentTask);
  const stages = useWorkspaceStore((state) => state.stages);
  const runStatus = useWorkspaceStore((state) => state.runStatus);
  const runProgress = useWorkspaceStore((state) => state.runProgress);
  const isSessionLoading = useWorkspaceStore((state) => state.isSessionLoading);
  const isSubmittingTask = useWorkspaceStore((state) => state.isSubmittingTask);
  const taskError = useWorkspaceStore((state) => state.taskError);
  const addChatMessage = useWorkspaceStore((state) => state.addChatMessage);
  const executeTaskCommand = useWorkspaceStore((state) => state.executeTaskCommand);
  const showToast = useWorkspaceStore((state) => state.showToast);
  const [draft, setDraft] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [workingDirectoryPath, setWorkingDirectoryPath] = useState(
    () => getDesktopSettings().workingDirectoryPath,
  );
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatMessages]);

  const persistWorkingDirectory = (path: string) => {
    setWorkingDirectoryPath(path);
    saveWorkingDirectoryPreference(path, 'Local Repo');
  };

  const handleSuggestionClick = (topic: string) => {
    setDraft(topic);
    showToast('示例研究方向已载入，你可以继续补充约束，或直接发送让系统开始推进。');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim()) {
      return;
    }

    if (draft.trim().length < 5) {
      showToast('输入过短，请补充更多研究目标、约束或产出要求。');
      return;
    }

    await addChatMessage(draft);
    setDraft('');
  };

  const completedStages = stages.filter((stage) => stage.status === 'completed').length;
  const conversationStatusCopy = currentTask
    ? '当前对话已经绑定真实工作流任务。每个模块完成后，AI 会主动汇报结果并询问你下一步如何处理。'
    : '当前仍处于需求澄清阶段。系统会在信息足够时自动创建并推进任务。';
  const activeThinkingMessageId = isSubmittingTask
    ? [...chatMessages].reverse().find((message) => message.kind === 'thinking')?.id
    : null;
  const activeRunningMessageId = runStatus === 'running'
    ? [...chatMessages].reverse().find((message) => message.kind === 'running-status')?.id
    : null;

  return (
    <div className="workspace-chat-page">
      <div className="workspace-chat-header">
        <AppLogo compact subtitle="Digital Research Atelier" />
        <div className="workspace-chat-header-copy">
          <div className="hero-eyebrow">Conversation First Research Agent</div>
          <h1 className="workspace-chat-title">今天想研究什么？</h1>
          <p className="workspace-chat-copy">
            你只需要描述研究目标、约束和想要的产出。ScholarMind 会先用自然语言澄清需求，再在时机合适时创建真实任务并持续反馈。
          </p>
        </div>
      </div>

      <div className="workspace-task-ribbon">
        <div className="workspace-task-line">
          <span className="kicker">当前任务</span>
          <strong>{currentTask?.title ?? '尚未创建研究任务'}</strong>
        </div>
        <div className="workspace-task-line">
          <span className="kicker">对话状态</span>
          <strong>{runStatusLabelMap[runStatus]}</strong>
        </div>
        <div className="workspace-task-line">
          <span className="kicker">已完成阶段</span>
          <strong>{currentTask ? `${completedStages}/9` : '0/9'}</strong>
        </div>
        <div className="workspace-task-line">
          <span className="kicker">总进度</span>
          <strong>{currentTask ? `${runProgress}%` : '等待任务创建'}</strong>
        </div>
      </div>

      <div className="workspace-conversation-insight">
        <div className="workspace-conversation-badge">
          <Sparkles size={15} />
          <span>{currentTask ? '主聊天页已接管任务控制' : '对话正在组织研究 brief'}</span>
        </div>
        <p>{conversationStatusCopy}</p>
      </div>

      {!currentTask && chatMessages.length <= 2 ? (
        <div className="workspace-suggestion-row">
          {promptSuggestions.map((item) => (
            <button
              key={item.title}
              className="workspace-suggestion-chip"
              onClick={() => handleSuggestionClick(`${item.title}：${item.detail}`)}
              type="button"
            >
              <Sparkles size={15} />
              <span>{item.title}</span>
              <small>{item.detail}</small>
            </button>
          ))}
        </div>
      ) : null}

      <div className="workspace-shortcuts">
        <button className="workspace-shortcut-button" onClick={() => navigate('/workflow')} type="button">
          <Target size={15} />
          研究流程
        </button>
        <button className="workspace-shortcut-button" onClick={() => navigate('/literature')} type="button">
          <BookOpen size={15} />
          文献综述
        </button>
        <button className="workspace-shortcut-button" onClick={() => navigate('/repository')} type="button">
          <FolderOpen size={15} />
          代码生成
        </button>
        <button className="workspace-shortcut-button" onClick={() => navigate('/agent-run')} type="button">
          <Bot size={15} />
          Agent 运行
        </button>
        <button className="workspace-shortcut-button" onClick={() => navigate('/settings')} type="button">
          <Settings2 size={15} />
          设置
        </button>
      </div>

      <div className="claude-thread">
        {chatMessages.map((message) => {
          const shouldAnimateThinking = message.id === activeThinkingMessageId;
          const shouldAnimateRunning = message.id === activeRunningMessageId;
          const shouldRenderStatusShell = message.kind === 'thinking' || message.kind === 'running-status';
          const shouldAnimate = shouldAnimateThinking || shouldAnimateRunning;

          return (
            <div
              key={message.id}
              className={`claude-message ${message.role}${message.kind === 'thinking' ? ' thinking' : ''}${message.kind === 'stage-transition' ? ' stage-transition' : ''}${message.kind === 'running-status' ? ' running-status' : ''}`}
            >
              <div className="claude-message-meta">
                <span className="claude-message-role">
                  {message.role === 'assistant' ? 'ScholarMind' : 'You'}
                </span>
                <span className="tiny muted">{message.timestamp}</span>
              </div>
              {shouldRenderStatusShell ? (
                <div className="claude-message-thinking">
                  <span>{renderMessageContent(message.content) as ReactNode}</span>
                  {shouldAnimate ? (
                    <div className="claude-thinking-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="claude-message-body">{renderMessageContent(message.content) as ReactNode}</div>
              )}
              {message.quickActions?.length ? (
                <div className="claude-message-actions">
                  {message.quickActions.map((action) => (
                    <ActionButton
                      action={action}
                      key={`${action.label}-${action.path ?? action.command ?? 'action'}`}
                      onCommand={(command) => void executeTaskCommand(command)}
                      onNavigate={(path) => navigate(path)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
        {taskError ? <div className="error-alert-academic">{sanitizeErrorMessage(taskError, '请求失败，请稍后重试。')}</div> : null}
        <div ref={threadEndRef} />
      </div>

      <div className="input-bay-container claude-composer-wrap">
        <TaskCommandBar />
        <form className="claude-composer" onSubmit={handleSubmit}>
          <textarea
            className="claude-composer-textarea"
            value={draft}
            disabled={isSessionLoading}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSubmit(event as unknown as FormEvent<HTMLFormElement>);
              }
            }}
            placeholder="直接说出你的研究目标、领域、方法约束、数据条件，或要求 AI 暂停 / 恢复 / 总结当前任务。"
            rows={1}
          />
          <div className="claude-composer-footer">
            <div className="claude-composer-tools">
              <button
                className={`workspace-shortcut-button${showAdvanced ? ' active' : ''}`}
                onClick={() => setShowAdvanced((value) => !value)}
                type="button"
              >
                <Paperclip size={14} />
                工作区配置
              </button>
            </div>
            <button
              className="claude-send-button"
              disabled={isSessionLoading || isSubmittingTask || !draft.trim()}
              type="submit"
            >
              {isSubmittingTask ? <div className="spinner-academic" /> : <SendHorizonal size={16} />}
              发送
            </button>
          </div>
        </form>

        {showAdvanced ? (
          <div className="advanced-config-panel animate-slide-up">
            <div className="config-row">
              <label>工作目录</label>
              <input
                className="academic-input"
                value={workingDirectoryPath}
                onChange={(event) => persistWorkingDirectory(event.target.value)}
                placeholder="C:\\path\\to\\ScholarMind"
              />
              <button
                className="button-ghost"
                onClick={() => {
                  setWorkingDirectoryPath('');
                  clearWorkingDirectoryPreference();
                }}
                type="button"
              >
                清除
              </button>
            </div>
            <div className="tiny muted">
              设置工作目录后，自动创建的任务会优先在该位置生成仓库、论文和实验产物。
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
