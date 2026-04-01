import {
  ArrowUpRight,
  BookOpen,
  Bot,
  FolderOpen,
  Paperclip,
  SendHorizonal,
  Settings2,
  Sparkles,
  Target,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLogo from '../components/ui/AppLogo';
import {
  clearWorkingDirectoryPreference,
  getDesktopSettings,
  saveWorkingDirectoryPreference,
} from '../services/preferences';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

const promptSuggestions = [
  {
    title: '多中心医学影像',
    detail: '联邦学习的跨域泛化与标签噪声问题',
  },
  {
    title: 'AI for Science',
    detail: '大语言模型在科学发现中的关键局限性评估',
  },
  {
    title: '可解释视觉模型',
    detail: '面向自动驾驶的 Transformer 结构创新',
  },
];

const runStatusLabelMap = {
  idle: '尚未启动',
  running: '运行中',
  paused: '已暂停',
  review: '待评审',
  completed: '已完成',
  failed: '失败',
  aborted: '已终止',
} as const;

export default function MainChatWorkspacePage() {
  const navigate = useNavigate();
  const chatMessages = useWorkspaceStore((state) => state.chatMessages);
  const currentTask = useWorkspaceStore((state) => state.currentTask);
  const stages = useWorkspaceStore((state) => state.stages);
  const runStatus = useWorkspaceStore((state) => state.runStatus);
  const runProgress = useWorkspaceStore((state) => state.runProgress);
  const isSubmittingTask = useWorkspaceStore((state) => state.isSubmittingTask);
  const taskError = useWorkspaceStore((state) => state.taskError);
  const addChatMessage = useWorkspaceStore((state) => state.addChatMessage);
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
    showToast('示例主题已载入，发送后即可创建真实任务。');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim()) {
      return;
    }
    if (draft.trim().length < 5) {
      showToast('研究主题过短，请补充更多目标或约束。');
      return;
    }
    await addChatMessage(draft);
    setDraft('');
  };

  const completedStages = stages.filter((stage) => stage.status === 'completed').length;

  return (
    <div className="workspace-chat-page">
      <div className="workspace-chat-header">
        <AppLogo compact subtitle="Digital Research Atelier" />
        <div className="workspace-chat-header-copy">
          <div className="hero-eyebrow">Claude-like Research Console</div>
          <h1 className="workspace-chat-title">以对话为核心组织整个 ScholarMind 研究流程</h1>
          <p className="workspace-chat-copy">
            主界面只保留任务、上下文和输入框。真正重要的信息跟随会话自然展开，而不是堆在仪表盘卡片里。
          </p>
        </div>
      </div>

      <div className="workspace-task-ribbon">
        <div className="workspace-task-line">
          <span className="kicker">当前任务</span>
          <strong>{currentTask?.title ?? '尚未创建研究任务'}</strong>
        </div>
        <div className="workspace-task-line">
          <span className="kicker">状态</span>
          <strong>{runStatusLabelMap[runStatus]}</strong>
        </div>
        <div className="workspace-task-line">
          <span className="kicker">已完成阶段</span>
          <strong>{completedStages}/12</strong>
        </div>
        <div className="workspace-task-line">
          <span className="kicker">总进度</span>
          <strong>{runProgress}%</strong>
        </div>
      </div>

      {!currentTask && chatMessages.length <= 1 ? (
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
          代码仓库
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
        {chatMessages.map((message) => (
          <div key={message.id} className={`claude-message ${message.role}`}>
            <div className="claude-message-meta">
              <span className="claude-message-role">
                {message.role === 'assistant' ? 'ScholarMind' : 'You'}
              </span>
              <span className="tiny muted">{message.timestamp}</span>
            </div>
            <div className="claude-message-body">{message.content}</div>
            {message.quickActions?.length ? (
              <div className="claude-message-actions">
                {message.quickActions.map((action) => (
                  <button
                    key={action.label}
                    className="workspace-shortcut-button"
                    onClick={() => navigate(action.path)}
                    type="button"
                  >
                    <ArrowUpRight size={14} />
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {taskError ? <div className="error-alert-academic">{taskError}</div> : null}
        <div ref={threadEndRef} />
      </div>

      <div className="input-bay-container claude-composer-wrap">
        <form className="claude-composer" onSubmit={handleSubmit}>
          <textarea
            className="claude-composer-textarea"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSubmit(event as unknown as FormEvent<HTMLFormElement>);
              }
            }}
            placeholder="描述研究主题、目标、约束，或说明你希望系统优先产出的结果。"
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
            <button className="claude-send-button" disabled={isSubmittingTask || !draft.trim()} type="submit">
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
                placeholder="C:\\Study\\HY Competition\\Project\\ScholarMind"
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
            <div className="tiny muted">设置工作目录后，后端会优先在该位置生成仓库、论文和实验产物。</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
