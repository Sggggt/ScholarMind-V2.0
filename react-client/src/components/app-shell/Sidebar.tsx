import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Plus, SquarePen } from 'lucide-react';
import { routeMeta } from '../../data/routeData';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import type { StageId } from '../../types/app';
import AppIcon from '../ui/AppIcon';
import AppLogo from '../ui/AppLogo';

const globalItems = ['workspace', 'history', 'workflow', 'settings'] as const;

const stageStatusLabelMap: Record<string, string> = {
  completed: '完成',
  'in-progress': '进行中',
  risk: '风险',
  'not-started': '待开始',
};

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const stages = useWorkspaceStore((state) => state.stages);
  const currentTask = useWorkspaceStore((state) => state.currentTask);
  const openStage = useWorkspaceStore((state) => state.openStage);
  const createSession = useWorkspaceStore((state) => state.createSession);

  const globalRoutes = routeMeta.filter((item) => globalItems.includes(item.id as (typeof globalItems)[number]));
  const stageRoutes = routeMeta.filter((item) => item.section === 'workflow');

  return (
    <aside className="sidebar">
      <AppLogo subtitle="Academic Research System" />

      <button
        className="sidebar-create-button"
        onClick={() => {
          createSession();
          navigate('/workspace');
        }}
        type="button"
      >
        <Plus size={16} />
        <span>新建研究</span>
      </button>

      <div className="sidebar-section">
        {globalRoutes.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            className={({ isActive }) => `sidebar-main-item${isActive ? ' active' : ''}`}
          >
            <div className="sidebar-main-icon">
              <AppIcon name={item.icon} size={16} />
            </div>
            <div className="sidebar-main-copy">
              <div className="sidebar-main-label">{item.title}</div>
              <div className="sidebar-main-note">{item.description}</div>
            </div>
          </NavLink>
        ))}
      </div>

      <div className="sidebar-stage-heading">Research Flow</div>
      <div className="sidebar-stage-list">
        {stageRoutes.map((item) => {
          const stage = stages.find((entry) => entry.id === item.id);
          const stageStatus = stage?.status ?? 'not-started';

          return (
            <button
              key={item.id}
              className={`sidebar-subitem${location.pathname === item.path ? ' active' : ''}`}
              onClick={() => {
                openStage(item.id as StageId);
                navigate(item.path);
              }}
              type="button"
            >
              <div className="sidebar-subitem-left">
                <span className={`sidebar-subitem-icon ${stageStatus}`}>
                  <AppIcon name={item.icon} size={14} />
                </span>
                <span className="sidebar-subitem-copy">
                  <span className="sidebar-subitem-title">{item.title}</span>
                  <span className="sidebar-subitem-note">{stage?.summary ?? item.description}</span>
                </span>
              </div>
              <span className={`sidebar-subitem-status ${stageStatus}`}>
                {stageStatusLabelMap[stageStatus] ?? stageStatus}
              </span>
            </button>
          );
        })}
      </div>

      <div className="sidebar-footer">
        <div className="sidebar-footer-label">当前任务</div>
        <div className="sidebar-footer-title">{currentTask?.title ?? '尚未创建任务'}</div>
        <div className="sidebar-footer-note">
          {currentTask?.topic ?? '从工作台输入研究主题后，系统会自动编排文献、缺口、实验与写作流程。'}
        </div>
        <button className="sidebar-footer-action" onClick={() => navigate('/workspace')} type="button">
          <SquarePen size={14} />
          回到对话台
        </button>
      </div>
    </aside>
  );
}
