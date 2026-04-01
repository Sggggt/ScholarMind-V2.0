import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';

export default function AppLayout() {
  return (
    <div className="shell">
      <Sidebar />
      <div className="main-column">
        <TopBar />
        <main className="workspace">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
