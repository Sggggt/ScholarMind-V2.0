import { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, useNavigate, useParams, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import ReviewAlert from './components/ReviewAlert';
import ToastContainer from './components/ToastContainer';
import { TaskDetailSkeleton, DashboardSkeleton } from './components/SkeletonLoader';
import { useTaskStore } from './stores/taskStore';
import { wsService } from './services/websocket';
import { useTheme } from './hooks/useTheme';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

// Lazy-loaded pages
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TaskDetail = lazy(() => import('./pages/TaskDetail'));
const Settings = lazy(() => import('./pages/Settings'));
const ReviewPanel = lazy(() => import('./pages/ReviewPanel'));
const LogViewer = lazy(() => import('./pages/LogViewer'));
const CodeViewer = lazy(() => import('./pages/CodeViewer'));
const PaperPreview = lazy(() => import('./pages/PaperPreview'));
const HelpPage = lazy(() => import('./pages/HelpPage'));

export type PageView = 'main' | 'settings';

export default function App() {
  const { handleWsMessage } = useTaskStore();
  const initTheme = useTheme((s) => s.init);

  // Initialize theme on mount
  useEffect(() => {
    initTheme();
  }, [initTheme]);

  // WebSocket connection
  useEffect(() => {
    wsService.connect();
    const unsub = wsService.subscribe(handleWsMessage);
    return () => {
      unsub();
      wsService.disconnect();
    };
  }, [handleWsMessage]);

  // Keyboard shortcuts (now uses navigate internally)
  useKeyboardShortcuts();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white dark:bg-[#1a1a2e] transition-colors">
      {/* Responsive sidebar */}
      <Sidebar />

      <main className="flex-1 flex flex-col min-w-0">
        <Header />
        <Suspense fallback={<DashboardSkeleton />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route
              path="/task/:taskId"
              element={
                <Suspense fallback={<TaskDetailSkeleton />}>
                  <TaskDetailRoute />
                </Suspense>
              }
            />
            <Route
              path="/task/:taskId/logs"
              element={
                <Suspense fallback={<TaskDetailSkeleton />}>
                  <LogViewerRoute />
                </Suspense>
              }
            />
            <Route
              path="/task/:taskId/review"
              element={
                <Suspense fallback={<TaskDetailSkeleton />}>
                  <ReviewPanelRoute />
                </Suspense>
              }
            />
            <Route
              path="/task/:taskId/code"
              element={
                <Suspense fallback={<TaskDetailSkeleton />}>
                  <CodeViewerRoute />
                </Suspense>
              }
            />
            <Route
              path="/task/:taskId/paper"
              element={
                <Suspense fallback={<TaskDetailSkeleton />}>
                  <PaperPreviewRoute />
                </Suspense>
              }
            />
            <Route path="/settings" element={<SettingsRoute />} />
            <Route
              path="/help"
              element={
                <Suspense fallback={<DashboardSkeleton />}>
                  <HelpPage />
                </Suspense>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <ReviewAlert />
      <ToastContainer />
    </div>
  );
}

// Route wrapper components that extract params and sync store
function TaskDetailRoute() {
  const { taskId } = useParams<{ taskId: string }>();
  const setCurrentTaskId = useTaskStore((s) => s.setCurrentTaskId);
  useEffect(() => {
    if (taskId) setCurrentTaskId(taskId);
  }, [taskId, setCurrentTaskId]);
  return <TaskDetail />;
}

function LogViewerRoute() {
  const { taskId } = useParams<{ taskId: string }>();
  return (
    <div className="flex-1 flex flex-col overflow-y-auto p-4">
      <LogViewer taskId={taskId || ''} />
    </div>
  );
}

function ReviewPanelRoute() {
  const { taskId } = useParams<{ taskId: string }>();
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-[900px] mx-auto">
        <ReviewPanel taskId={taskId || ''} />
      </div>
    </div>
  );
}

function CodeViewerRoute() {
  const { taskId } = useParams<{ taskId: string }>();
  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4">
      <CodeViewer taskId={taskId || ''} />
    </div>
  );
}

function PaperPreviewRoute() {
  const { taskId } = useParams<{ taskId: string }>();
  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4">
      <PaperPreview taskId={taskId || ''} />
    </div>
  );
}

function SettingsRoute() {
  const navigate = useNavigate();
  return <Settings onClose={() => navigate('/')} />;
}
