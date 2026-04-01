import { NavLink } from 'react-router-dom';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';

const processTabs = [
  { label: '流程总览', to: '/workflow' },
  { label: '文献采集', to: '/literature' },
  { label: '论文写作', to: '/writing' },
  { label: '结论验证', to: '/validation' },
];

export default function TopBar() {
  const searchQuery = useWorkspaceStore((state) => state.searchQuery);
  const setSearchQuery = useWorkspaceStore((state) => state.setSearchQuery);

  return (
    <header className="topbar">
      <div className="topbar-brandline">SCHOLARMIND 研究流程</div>

      <nav className="topbar-tabs">
        {processTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) => `topbar-tab${isActive ? ' active' : ''}`}
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="topbar-right">
        <label className="topbar-search">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索研究节点、文献或草稿..."
            type="text"
          />
        </label>
        <NavLink className={({ isActive }) => `topbar-pill${isActive ? ' active' : ''}`} to="/history">
          历史记录
        </NavLink>
        <NavLink className={({ isActive }) => `topbar-pill${isActive ? ' active' : ''}`} to="/workspace">
          主工作台
        </NavLink>
      </div>
    </header>
  );
}
