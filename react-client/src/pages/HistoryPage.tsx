import { useDeferredValue, useMemo } from 'react';
import { EditorialPage, SectionBlock } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function HistoryPage() {
  const sessions = useWorkspaceStore((state) => state.sessions);
  const currentSessionId = useWorkspaceStore((state) => state.currentSessionId);
  const selectSession = useWorkspaceStore((state) => state.selectSession);
  const searchQuery = useWorkspaceStore((state) => state.searchQuery);
  const deferredQuery = useDeferredValue(searchQuery);

  const filteredSessions = useMemo(() => {
    const keyword = deferredQuery.trim().toLowerCase();
    if (!keyword) return sessions;
    return sessions.filter(
      (session) =>
        session.title.toLowerCase().includes(keyword) ||
        session.domain.toLowerCase().includes(keyword) ||
        session.stageLabel.toLowerCase().includes(keyword),
    );
  }, [deferredQuery, sessions]);

  return (
    <EditorialPage
      eyebrow="历史"
      title="查看近期会话并恢复已有研究上下文"
      description="这里保留会话中心视角，帮助用户在不重新整理上下文的情况下继续研究。"
    >
      <SectionBlock title="近期会话" description="当顶部搜索框有内容时，这里会按关键词过滤。">
        <div className="stack">
          {filteredSessions.map((session) => (
            <button
              key={session.id}
              className={`session-item${session.id === currentSessionId ? ' active' : ''}`}
              onClick={() => selectSession(session.id)}
              type="button"
            >
              <div style={{ flex: 1, textAlign: 'left' }}>
                <strong>{session.title}</strong>
                <div className="tiny muted">{session.domain}</div>
              </div>
              <div className="tiny muted">
                {session.stageLabel}
                <br />
                {session.updatedAt}
              </div>
            </button>
          ))}
        </div>
      </SectionBlock>
    </EditorialPage>
  );
}
