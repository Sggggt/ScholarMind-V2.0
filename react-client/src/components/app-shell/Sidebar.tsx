import { ChevronDown, ChevronRight, Circle, Plus } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { routeMeta } from '../../data/routeData';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { StageId, WorkflowStatus } from '../../types/app';
import AppIcon from '../ui/AppIcon';

const primaryItems = [
  { id: 'workspace', label: '工作台', path: '/workspace', note: '12 条线索已整理', icon: 'MessagesSquare' },
  { id: 'history', label: '历史', path: '/history', note: '8 个历史会话', icon: 'History' },
  { id: 'workflow', label: '流程', path: '/workflow', note: '4/12 阶段已激活', icon: 'GitBranch' },
] as const;

const workflowStageIds: StageId[] = [
  'exploration',
  'literature',
  'extraction',
  'trends',
  'gaps',
  'ideas',
  'repository',
  'experiment',
  'agent-run',
  'results',
  'writing',
  'validation',
];

const statusLabelMap: Record<WorkflowStatus, string> = {
  'not-started': '未开始',
  'in-progress': '进行中',
  completed: '已完成',
  risk: '风险',
};

function isStageId(id: string): id is StageId {
  return workflowStageIds.includes(id as StageId);
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const sessions = useWorkspaceStore((state) => state.sessions);
  const currentSessionId = useWorkspaceStore((state) => state.currentSessionId);
  const selectSession = useWorkspaceStore((state) => state.selectSession);
  const createSession = useWorkspaceStore((state) => state.createSession);
  const openStage = useWorkspaceStore((state) => state.openStage);
  const workflowStages = useWorkspaceStore((state) => state.stages);
  const [workflowExpanded, setWorkflowExpanded] = useState(true);

  const workflowChildren = routeMeta.filter((item) => item.section === 'workflow');

  return (
    <aside className="sidebar">
      <div className="sidebar-scrollable">
        <div className="sidebar-brand">
          <div className="brand-mark">S</div>
        <div>
          <div className="sidebar-brand-title serif">ScholarMind</div>
          <div className="sidebar-brand-subtitle">学术研究工作台</div>
        </div>
      </div>

      <div className="sidebar-section">
        {primaryItems.map((item) => {
          if (item.id !== 'workflow') {
            return (
              <NavLink
                key={item.id}
                to={item.path}
                className={({ isActive }) => `sidebar-main-item${isActive ? ' active' : ''}`}
              >
                <div className="sidebar-main-icon">
                  <AppIcon name={item.icon} size={16} />
                </div>
                <div>
                  <div className="sidebar-main-label">{item.label}</div>
                  <div className="sidebar-main-note">{item.note}</div>
                </div>
              </NavLink>
            );
          }

          const workflowActive =
            location.pathname === '/workflow' || workflowChildren.some((child) => child.path === location.pathname);

          return (
            <div key={item.id} className="sidebar-workflow-group">
              <div className={`sidebar-main-item${workflowActive ? ' active' : ''}`}>
                <button className="sidebar-main-link" onClick={() => navigate(item.path)} type="button">
                  <div className="sidebar-main-icon">
                    <AppIcon name={item.icon} size={16} />
                  </div>
                  <div>
                    <div className="sidebar-main-label">{item.label}</div>
                    <div className="sidebar-main-note">{item.note}</div>
                  </div>
                </button>
                <button
                  className="sidebar-toggle"
                  onClick={() => setWorkflowExpanded((value) => !value)}
                  type="button"
                  aria-label={workflowExpanded ? '收起流程子栏' : '展开流程子栏'}
                >
                  {workflowExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              </div>

              <div className={`sidebar-submenu${workflowExpanded ? ' expanded' : ''}`}>
                {workflowChildren.map((child) => {
                  const stage = isStageId(child.id)
                    ? workflowStages.find((itemStage) => itemStage.id === child.id)
                    : undefined;
                  const childActive = location.pathname === child.path;

                  return (
                    <button
                      key={child.id}
                      className={`sidebar-subitem${childActive ? ' active' : ''}`}
                      onClick={() => {
                        if (isStageId(child.id)) {
                          openStage(child.id);
                        }
                        navigate(child.path);
                      }}
                      type="button"
                    >
                      <div className="sidebar-subitem-left">
                        {child.icon ? (
                          <div className="sidebar-subitem-icon">
                            <AppIcon name={child.icon as any} size={14} />
                          </div>
                        ) : null}
                        <span className="sidebar-subitem-title">{child.title}</span>
                      </div>
                      {stage ? (
                        <span className={`sidebar-subitem-status ${stage.status}`}>
                          {statusLabelMap[stage.status]}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="sidebar-recent">
        <div className="sidebar-recent-label">近期会话</div>
        <div className="sidebar-session-list">
          {sessions.map((session) => (
            <button
              key={session.id}
              className={`sidebar-session${session.id === currentSessionId ? ' active' : ''}`}
              onClick={() => selectSession(session.id)}
              type="button"
            >
              <div className="sidebar-session-dot">
                <Circle size={8} />
              </div>
              <div style={{ textAlign: 'left', flex: 1 }}>
                <div className="sidebar-session-title">{session.title}</div>
                <div className="sidebar-session-meta">
                  {session.updatedAt} · {session.domain}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      </div>

      <div className="sidebar-bottom">
        <button className="sidebar-settings" type="button">
          <AppIcon name="Settings2" size={16} />
          <div style={{ textAlign: 'left' }}>
            <div className="sidebar-main-label">设置</div>
            <div className="sidebar-main-note">
              当前阶段：{location.pathname === '/workspace' ? '工作台' : '研究流程'}
            </div>
          </div>
        </button>
        <button className="sidebar-new-session" onClick={createSession} type="button" aria-label="新建会话">
          <Plus size={14} />
        </button>
      </div>
    </aside>
  );
}
