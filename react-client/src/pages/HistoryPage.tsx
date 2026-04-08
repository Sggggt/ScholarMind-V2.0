import { ArrowUpRight, Check, RotateCcw, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EditorialPage, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

const restartableTaskStatuses = new Set(['paused', 'review', 'completed', 'failed', 'aborted']);

export default function HistoryPage() {
  const navigate = useNavigate();
  const sessions = useWorkspaceStore((state) => state.sessions);
  const currentSessionId = useWorkspaceStore((state) => state.currentSessionId);
  const isInitializing = useWorkspaceStore((state) => state.isInitializing);
  const selectSession = useWorkspaceStore((state) => state.selectSession);
  const deleteSession = useWorkspaceStore((state) => state.deleteSession);
  const deleteTaskHistory = useWorkspaceStore((state) => state.deleteTaskHistory);
  const restartCurrentTask = useWorkspaceStore((state) => state.restartCurrentTask);
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredSessions = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return sessions;
    }

    return sessions.filter(
      (session) =>
        session.title.toLowerCase().includes(keyword) ||
        session.domain.toLowerCase().includes(keyword) ||
        session.stageLabel.toLowerCase().includes(keyword),
    );
  }, [query, sessions]);

  return (
    <EditorialPage
      eyebrow="Research Archive"
      title="管理研究会话与历史任务"
      description="这里保留后端真实任务的入口。你可以切换到任意历史研究，或删除已经不再需要的工作区与数据库记录。"
    >
      <SectionBlock
        title="任务索引"
        description="按标题、领域或阶段检索。切换任务会恢复对应的运行状态、日志和阶段视图。"
        action={<StatusBadge status={sessions.length ? 'completed' : 'not-started'} label={`${sessions.length} 条`} />}
      >
        <div className="stack">
          <input
            className="toolbar-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、研究领域或阶段标签"
            type="text"
          />

          <div className="history-list">
            {isInitializing && <div className="empty-state">正在同步后端任务列表...</div>}
            {!isInitializing && !filteredSessions.length && (
              <div className="empty-state">
                {query ? '没有匹配的任务记录。' : '暂无历史任务，回到工作台创建第一个研究会话。'}
              </div>
            )}

            {filteredSessions.map((session) => {
              const isCurrent = session.id === currentSessionId;
              const canRestart = Boolean(session.taskId && session.taskStatus && restartableTaskStatuses.has(session.taskStatus));

              return (
                <div key={session.id} className={`history-row${isCurrent ? ' active' : ''}`}>
                  <button
                    className="history-row-main"
                    onClick={() => {
                      void selectSession(session.id);
                      navigate('/workspace');
                    }}
                    type="button"
                  >
                    <div className="history-title-row">
                      <span className="history-title">{session.title}</span>
                      <StatusBadge status={isCurrent ? 'in-progress' : 'completed'} label={session.stageLabel} />
                    </div>
                    <div className="history-meta-row">
                      <span className="history-meta">最后更新：{session.updatedAt}</span>
                      <span className="history-meta">研究领域：{session.domain || '通用研究'}</span>
                    </div>
                  </button>

                  <div className="history-actions">
                    {deletingId === session.id ? (
                      <div className="confirm-group">
                        <span className="tiny muted">确认删除该任务？</span>
                        <button
                          className="button-ghost danger"
                          onClick={() => {
                            void (session.taskId ? deleteTaskHistory(session.taskId) : deleteSession(session.id));
                            setDeletingId(null);
                          }}
                          type="button"
                        >
                          <Check size={14} />
                          删除
                        </button>
                        <button className="button-ghost" onClick={() => setDeletingId(null)} type="button">
                          <X size={14} />
                          取消
                        </button>
                      </div>
                    ) : (
                      <>
                        {canRestart ? (
                          <button
                            className="history-delete"
                            onClick={() => {
                              if (!window.confirm('确认重启该历史任务吗？这会开始一轮新的执行。')) {
                                return;
                              }

                              void (async () => {
                                await selectSession(session.id);
                                navigate('/workspace');
                                await restartCurrentTask();
                              })();
                            }}
                            type="button"
                          >
                            <RotateCcw size={14} />
                            重启
                          </button>
                        ) : null}
                        <button className="history-delete" onClick={() => setDeletingId(session.id)} type="button">
                          {isCurrent ? <ArrowUpRight size={14} /> : <Trash2 size={14} />}
                          删除
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </SectionBlock>
    </EditorialPage>
  );
}
