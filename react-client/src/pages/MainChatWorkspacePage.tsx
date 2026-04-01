import { Send } from 'lucide-react';
import type { FormEvent } from 'react';
import { startTransition, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function MainChatWorkspacePage() {
  const navigate = useNavigate();
  const chatMessages = useWorkspaceStore((state) => state.chatMessages);
  const addChatMessage = useWorkspaceStore((state) => state.addChatMessage);
  const openStage = useWorkspaceStore((state) => state.openStage);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatMessages]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDraft(e.target.value);

    // Auto-resize logic constrained to approx 300px max
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 300)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (draft.trim()) {
        const fakeEvent = { preventDefault: () => {} } as FormEvent<HTMLFormElement>;
        handleSubmit(fakeEvent);
      }
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim()) return;

    startTransition(() => {
      addChatMessage(draft.trim());
      setDraft('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'; // Reset height
      }
    });
  };

  return (
    <div className="workspace-main-page">
      <section className="workspace-intro">
        <div className="workspace-intro-main">
          <div className="workspace-intro-eyebrow">主工作台</div>
          <h1 className="workspace-intro-title serif">研究主控台保持对话，但不丢掉流程。</h1>
          <p className="workspace-intro-copy">
            工作台中心以连续消息流组织问题、总结和跳转动作。每条回复都可以直接推进到下游模块，让对话始终保持控制中心的角色。
          </p>
          <div className="workspace-tag-row">
            <span className="workspace-tag">底部固定输入区</span>
            <span className="workspace-tag">长文本与结构化总结</span>
            <span className="workspace-tag">下游模块快捷入口</span>
          </div>
        </div>
      </section>

      <div className="workspace-grid">
        <div className="workspace-thread">
          {chatMessages.map((message, index) =>
            message.role === 'assistant' ? (
              <section key={message.id} className={`assistant-sheet${index > 1 ? ' secondary' : ''}`}>
                <p className="assistant-sheet-copy">{message.content}</p>
                {index === 0 ? (
                  <>
                    <div className="workspace-chip-row">
                      <span className="workspace-chip">联邦学习</span>
                      <span className="workspace-chip">医学影像</span>
                      <span className="workspace-chip">跨域泛化</span>
                    </div>
                    <div className="assistant-sheet-source">
                      引用来源：《自然·医学》2024 · MICCAI 2025
                    </div>
                  </>
                ) : null}
                {message.quickActions?.length ? (
                  <div className="workspace-action-row">
                    {message.quickActions.map((action) => (
                      <button
                        key={action.label}
                        className="workspace-action-button"
                        onClick={() => {
                          if (action.stageId) {
                            openStage(action.stageId);
                          }
                          navigate(action.path);
                        }}
                        type="button"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : (
              <div key={message.id} className="user-bubble">
                {message.content}
              </div>
            ),
          )}

          <form
            className="workspace-composer"
            onSubmit={handleSubmit}
          >
            <textarea
              ref={textareaRef}
              className="workspace-composer-textarea"
              value={draft}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="继续追问、要求结构化总结，或直接让系统推进到某个研究阶段……"
            />
            <div className="workspace-composer-footer">
              <div className="workspace-chip-row">
                <span className="workspace-chip">联网检索</span>
                <span className="workspace-chip">结构化摘要</span>
                <span className="workspace-chip">实验草案</span>
              </div>
              <button className="workspace-send" type="submit">
                <Send size={15} />
                发送
              </button>
            </div>
          </form>
          <div ref={messagesEndRef} style={{ height: 1, marginTop: -1 }} />
        </div>

        <aside className="workspace-rail">
          <div className="workspace-context-box">
            <div className="workspace-rail-label">当前上下文</div>
            <div className="workspace-rail-chip-row">
              <span className="workspace-mini-chip">会话连续性</span>
              <span className="workspace-mini-chip">趋势洞察</span>
              <span className="workspace-mini-chip">缺口决策</span>
            </div>
          </div>

          <div className="workspace-rail-block">
            <h3 className="workspace-rail-title serif">下游动作</h3>
            <p className="workspace-rail-copy">对话中出现的结论可直接推进到后续模块。</p>
            <div className="workspace-rail-actions">
              <button className="workspace-action-button" onClick={() => navigate('/literature')} type="button">
                进入文献采集
              </button>
              <button className="workspace-action-button" onClick={() => navigate('/gaps')} type="button">
                查看研究缺口
              </button>
              <button className="workspace-action-button" onClick={() => navigate('/experiment')} type="button">
                生成实验设计
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
