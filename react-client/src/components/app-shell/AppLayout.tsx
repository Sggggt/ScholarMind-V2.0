import { Outlet } from 'react-router-dom';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import WorkspaceSync from './WorkspaceSync';

export default function AppLayout() {
  const toastMessage = useWorkspaceStore((state) => state.toastMessage);

  return (
    <div className="shell">
      <WorkspaceSync />
      <Sidebar />
      <div className="main-column">
        <TopBar />
        <main className="workspace">
          <Outlet />
        </main>
      </div>
      {toastMessage ? <div className="toast-shell">{toastMessage}</div> : null}
      <div className="shell-aura shell-aura-primary" />
      <div className="shell-aura shell-aura-secondary" />
    </div>
  );
}
