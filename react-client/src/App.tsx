import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/app-shell/AppLayout';
import AgentRunPage from './pages/AgentRunPage';
import DomainExplorationPage from './pages/DomainExplorationPage';
import ExperimentDesignPage from './pages/ExperimentDesignPage';
import HistoryPage from './pages/HistoryPage';
import IdeaGenerationPage from './pages/IdeaGenerationPage';
import InformationExtractionPage from './pages/InformationExtractionPage';
import LiteraturePage from './pages/LiteraturePage';
import LoginPage from './pages/LoginPage';
import MainChatWorkspacePage from './pages/MainChatWorkspacePage';
import RepositoryPage from './pages/RepositoryPage';
import ResearchGapsPage from './pages/ResearchGapsPage';
import ResultsAnalysisPage from './pages/ResultsAnalysisPage';
import SettingsPage from './pages/SettingsPage';
import TrendAnalysisPage from './pages/TrendAnalysisPage';
import ValidationPage from './pages/ValidationPage';
import WorkflowOverviewPage from './pages/WorkflowOverviewPage';
import WritingPage from './pages/WritingPage';
import { useWorkspaceStore } from './store/useWorkspaceStore';

function RequireAuth() {
  const isAuthenticated = useWorkspaceStore((state) => state.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <AppLayout />;
}

export default function App() {
  const isAuthenticated = useWorkspaceStore((state) => state.isAuthenticated);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/workspace" replace /> : <LoginPage />}
        />
        <Route element={<RequireAuth />}>
          <Route index element={<Navigate to="/workspace" replace />} />
          <Route path="/workspace" element={<MainChatWorkspacePage />} />
          <Route path="/workflow" element={<WorkflowOverviewPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/exploration" element={<DomainExplorationPage />} />
          <Route path="/literature" element={<LiteraturePage />} />
          <Route path="/extraction" element={<InformationExtractionPage />} />
          <Route path="/trends" element={<TrendAnalysisPage />} />
          <Route path="/gaps" element={<ResearchGapsPage />} />
          <Route path="/ideas" element={<IdeaGenerationPage />} />
          <Route path="/repository" element={<RepositoryPage />} />
          <Route path="/experiment" element={<ExperimentDesignPage />} />
          <Route path="/agent-run" element={<AgentRunPage />} />
          <Route path="/results" element={<ResultsAnalysisPage />} />
          <Route path="/writing" element={<WritingPage />} />
          <Route path="/validation" element={<ValidationPage />} />
        </Route>
        <Route
          path="*"
          element={<Navigate to={isAuthenticated ? '/workspace' : '/login'} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
