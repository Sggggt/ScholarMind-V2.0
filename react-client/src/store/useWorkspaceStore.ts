import { create } from 'zustand';
import { initialStages } from '../data/routeData';
import {
  experimentDesign,
  experimentResults,
  explorationState,
  extractionRelations,
  extractionSections,
  hotDirections,
  ideaCandidates,
  initialChatMessages,
  initialRunLogs,
  literatureFilters,
  paperRecords,
  rankedPapers,
  recentSessions,
  repositoryFiles,
  researchGaps,
  runSteps,
  trendEvents,
  userProfile,
  validationClaims,
  writingSections,
} from '../data/researchData';
import type {
  ChatMessage,
  ChatQuickAction,
  ExperimentDesignState,
  ExperimentResult,
  ExtractionSection,
  LiteratureFilters,
  PaperRecord,
  RecentSession,
  RelationNode,
  ResearchGap,
  RunLog,
  RunStep,
  StageId,
  TrendEvent,
  ValidationClaim,
  WorkflowStage,
  WorkflowStatus,
  WritingSection,
} from '../types/app';

interface WorkspaceState {
  isAuthenticated: boolean;
  currentSessionId: string;
  currentStage: StageId;
  stages: WorkflowStage[];
  sessions: RecentSession[];
  searchQuery: string;
  chatMessages: ChatMessage[];
  exploration: typeof explorationState;
  selectedSources: string[];
  literatureFilters: LiteratureFilters;
  collectionProgress: number;
  isCollecting: boolean;
  papers: PaperRecord[];
  activePaperId: string;
  extractionSections: ExtractionSection[];
  extractionRelations: RelationNode[];
  activeExtractionSectionId: string;
  trendRange: '3y' | '5y' | 'all';
  trendEvents: TrendEvent[];
  hotDirections: string[];
  rankedPapers: typeof rankedPapers;
  activeRankedPaperId: string;
  researchGaps: ResearchGap[];
  activeGapId: string;
  ideas: typeof ideaCandidates;
  selectedIdeaId: string;
  repositoryFiles: typeof repositoryFiles;
  activeRepositoryFileId: string;
  experimentDesign: ExperimentDesignState;
  runSteps: RunStep[];
  runLogs: RunLog[];
  runProgress: number;
  runStatus: 'idle' | 'running' | 'completed';
  results: ExperimentResult[];
  activeResultId: string;
  writingSections: WritingSection[];
  activeWritingSectionId: string;
  validationClaims: ValidationClaim[];
  resolvedClaimIds: string[];
  user: typeof userProfile;
  login: (email: string) => void;
  logout: () => void;
  setSearchQuery: (query: string) => void;
  openStage: (stageId: StageId) => void;
  setStageStatus: (stageId: StageId, status: WorkflowStatus) => void;
  addChatMessage: (content: string) => void;
  updateTopic: (topic: string) => void;
  toggleSource: (source: string) => void;
  updateLiteratureFilters: (patch: Partial<LiteratureFilters>) => void;
  startCollection: () => void;
  setCollectionProgress: (progress: number) => void;
  finishCollection: () => void;
  selectPaper: (paperId: string) => void;
  setExtractionSection: (sectionId: string) => void;
  setTrendRange: (range: '3y' | '5y' | 'all') => void;
  setActiveRankedPaper: (paperId: string) => void;
  setActiveGap: (gapId: string) => void;
  promoteGapToIdeas: (gapId: string) => void;
  selectIdea: (ideaId: string) => void;
  setRepositoryFile: (fileId: string) => void;
  updateExperimentDesign: (patch: Partial<ExperimentDesignState>) => void;
  saveExperimentDesign: () => void;
  startRun: () => void;
  tickRun: () => void;
  setResult: (resultId: string) => void;
  setWritingSection: (sectionId: string) => void;
  updateWritingContent: (sectionId: string, content: string) => void;
  toggleResolvedClaim: (claimId: string) => void;
  selectSession: (sessionId: string) => void;
  createSession: () => void;
}

const stageOrder: StageId[] = initialStages.map((stage) => stage.id);

const nextStatusMap = (
  stages: WorkflowStage[],
  stageId: StageId,
  status: WorkflowStatus,
): WorkflowStage[] => {
  const stageIndex = stageOrder.indexOf(stageId);

  return stages.map((stage, index) => {
    if (stage.id === stageId) {
      return { ...stage, status };
    }

    if (status === 'completed' && index === stageIndex + 1 && stage.status === 'not-started') {
      return { ...stage, status: 'in-progress' };
    }

    return stage;
  });
};

const inferQuickActions = (content: string): ChatQuickAction[] => {
  const normalized = content.toLowerCase();

  if (normalized.includes('experiment') || content.includes('实验')) {
    return [
      { label: '打开实验设计', path: '/experiment', stageId: 'experiment' },
      { label: '查看资料库', path: '/repository', stageId: 'repository' },
      { label: '准备智能体运行', path: '/agent-run', stageId: 'agent-run' },
    ];
  }

  if (
    normalized.includes('gap') ||
    normalized.includes('weakness') ||
    content.includes('缺口') ||
    content.includes('问题')
  ) {
    return [
      { label: '查看研究缺口', path: '/gaps', stageId: 'gaps' },
      { label: '生成候选想法', path: '/ideas', stageId: 'ideas' },
      { label: '返回趋势分析', path: '/trends', stageId: 'trends' },
    ];
  }

  return [
    { label: '进入领域探索', path: '/exploration', stageId: 'exploration' },
    { label: '开始文献采集', path: '/literature', stageId: 'literature' },
    { label: '开始论文写作', path: '/writing', stageId: 'writing' },
  ];
};

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  isAuthenticated: false,
  currentSessionId: recentSessions[0].id,
  currentStage: 'trends',
  stages: initialStages,
  sessions: recentSessions,
  searchQuery: '',
  chatMessages: initialChatMessages,
  exploration: explorationState,
  selectedSources: ['arXiv', 'PubMed', 'Crossref', 'Semantic Scholar'],
  literatureFilters,
  collectionProgress: 74,
  isCollecting: false,
  papers: paperRecords,
  activePaperId: paperRecords[0].id,
  extractionSections,
  extractionRelations,
  activeExtractionSectionId: extractionSections[0].id,
  trendRange: '5y',
  trendEvents,
  hotDirections,
  rankedPapers,
  activeRankedPaperId: rankedPapers[0].id,
  researchGaps,
  activeGapId: researchGaps[0].id,
  ideas: ideaCandidates,
  selectedIdeaId: ideaCandidates.find((idea) => idea.recommended)?.id ?? ideaCandidates[0].id,
  repositoryFiles,
  activeRepositoryFileId: repositoryFiles[0].id,
  experimentDesign,
  runSteps,
  runLogs: initialRunLogs,
  runProgress: 62,
  runStatus: 'idle',
  results: experimentResults,
  activeResultId: experimentResults[0].id,
  writingSections,
  activeWritingSectionId: writingSections[0].id,
  validationClaims,
  resolvedClaimIds: [],
  user: userProfile,
  login: () => set({ isAuthenticated: true }),
  logout: () => set({ isAuthenticated: false }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  openStage: (stageId) =>
    set((state) => ({
      currentStage: stageId,
      stages:
        state.stages.find((stage) => stage.id === stageId)?.status === 'not-started'
          ? nextStatusMap(state.stages, stageId, 'in-progress')
          : state.stages,
    })),
  setStageStatus: (stageId, status) =>
    set((state) => ({
      currentStage: stageId,
      stages: nextStatusMap(state.stages, stageId, status),
    })),
  addChatMessage: (content) => {
    const timestamp = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp,
    };

    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now() + 1}`,
      role: 'assistant',
      timestamp,
      content:
        '你的问题已加入当前研究线索。建议先确认已有证据，再把最强结论推进到下游模块，保持流程连续而不打断当前语境。',
      quickActions: inferQuickActions(content),
    };

    set((state) => ({
      chatMessages: [...state.chatMessages, userMessage, assistantMessage],
      stages:
        state.stages.find((stage) => stage.id === 'exploration')?.status === 'not-started'
          ? nextStatusMap(state.stages, 'exploration', 'in-progress')
          : state.stages,
    }));
  },
  updateTopic: (topic) =>
    set((state) => ({
      exploration: { ...state.exploration, topic },
      literatureFilters: { ...state.literatureFilters, topic },
    })),
  toggleSource: (source) =>
    set((state) => ({
      selectedSources: state.selectedSources.includes(source)
        ? state.selectedSources.filter((item) => item !== source)
        : [...state.selectedSources, source],
    })),
  updateLiteratureFilters: (patch) =>
    set((state) => ({
      literatureFilters: { ...state.literatureFilters, ...patch },
    })),
  startCollection: () =>
    set((state) => ({
      isCollecting: true,
      collectionProgress: 0,
      currentStage: 'literature',
      stages: nextStatusMap(state.stages, 'literature', 'in-progress'),
    })),
  setCollectionProgress: (progress) => set({ collectionProgress: progress }),
  finishCollection: () =>
    set((state) => ({
      isCollecting: false,
      collectionProgress: 100,
      stages: nextStatusMap(state.stages, 'literature', 'completed'),
      currentStage: 'extraction',
    })),
  selectPaper: (paperId) =>
    set((state) => ({
      activePaperId: paperId,
      papers: state.papers.map((paper) =>
        paper.id === paperId ? { ...paper, status: 'selected' } : paper,
      ),
      currentStage: 'extraction',
      stages: nextStatusMap(state.stages, 'extraction', 'in-progress'),
    })),
  setExtractionSection: (sectionId) => set({ activeExtractionSectionId: sectionId }),
  setTrendRange: (range) => set({ trendRange: range }),
  setActiveRankedPaper: (paperId) => set({ activeRankedPaperId: paperId }),
  setActiveGap: (gapId) =>
    set((state) => ({
      activeGapId: gapId,
      currentStage: 'gaps',
      stages: nextStatusMap(state.stages, 'gaps', 'in-progress'),
    })),
  promoteGapToIdeas: (gapId) =>
    set((state) => ({
      activeGapId: gapId,
      currentStage: 'ideas',
      stages: nextStatusMap(nextStatusMap(state.stages, 'gaps', 'completed'), 'ideas', 'in-progress'),
    })),
  selectIdea: (ideaId) =>
    set((state) => ({
      selectedIdeaId: ideaId,
      currentStage: 'repository',
      stages: nextStatusMap(nextStatusMap(state.stages, 'ideas', 'completed'), 'repository', 'in-progress'),
    })),
  setRepositoryFile: (fileId) => set({ activeRepositoryFileId: fileId }),
  updateExperimentDesign: (patch) =>
    set((state) => ({
      experimentDesign: { ...state.experimentDesign, ...patch },
    })),
  saveExperimentDesign: () =>
    set((state) => ({
      currentStage: 'agent-run',
      stages: nextStatusMap(nextStatusMap(state.stages, 'experiment', 'completed'), 'agent-run', 'in-progress'),
    })),
  startRun: () =>
    set((state) => ({
      runStatus: 'running',
      runProgress: 0,
      currentStage: 'agent-run',
      runSteps: state.runSteps.map((step, index) =>
        index === 0 ? { ...step, status: 'in-progress' } : { ...step, status: 'not-started' },
      ),
      runLogs: [
        ...state.runLogs,
        {
          id: `log-${Date.now()}`,
          level: 'info',
          timestamp: new Date().toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          }),
          message: '智能体运行已启动，正在准备执行图与检查点。',
        },
      ],
    })),
  tickRun: () => {
    const state = get();

    if (state.runStatus !== 'running') {
      return;
    }

    const nextProgress = Math.min(state.runProgress + 20, 100);
    const nextIndex = Math.min(Math.floor(nextProgress / 25), state.runSteps.length - 1);

    const nextSteps = state.runSteps.map((step, index) => {
      if (index < nextIndex || nextProgress === 100) {
        return { ...step, status: 'completed' as WorkflowStatus };
      }

      if (index === nextIndex) {
        return { ...step, status: 'in-progress' as WorkflowStatus };
      }

      return { ...step, status: 'not-started' as WorkflowStatus };
    });

    const nextLog: RunLog = {
      id: `run-log-${Date.now()}`,
      level: nextProgress >= 80 ? 'warning' : 'info',
      timestamp: new Date().toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
      message:
        nextProgress >= 80
          ? '执行接近完成，仍有一个低标签中心批次被标记为需要复核。'
          : `执行已推进到 ${nextProgress}%，当前激活子任务 ${nextIndex + 1}。`,
    };

    set((current) => ({
      runProgress: nextProgress,
      runSteps: nextSteps,
      runLogs: [...current.runLogs, nextLog],
      runStatus: nextProgress === 100 ? 'completed' : 'running',
      stages:
        nextProgress === 100
          ? nextStatusMap(nextStatusMap(current.stages, 'agent-run', 'completed'), 'results', 'in-progress')
          : current.stages,
      currentStage: nextProgress === 100 ? 'results' : 'agent-run',
    }));
  },
  setResult: (resultId) => set({ activeResultId: resultId }),
  setWritingSection: (sectionId) =>
    set((state) => ({
      activeWritingSectionId: sectionId,
      currentStage: 'writing',
      stages: nextStatusMap(state.stages, 'writing', 'in-progress'),
    })),
  updateWritingContent: (sectionId, content) =>
    set((state) => ({
      writingSections: state.writingSections.map((section) =>
        section.id === sectionId ? { ...section, content } : section,
      ),
    })),
  toggleResolvedClaim: (claimId) =>
    set((state) => ({
      resolvedClaimIds: state.resolvedClaimIds.includes(claimId)
        ? state.resolvedClaimIds.filter((id) => id !== claimId)
        : [...state.resolvedClaimIds, claimId],
      currentStage: 'validation',
      stages: nextStatusMap(state.stages, 'validation', 'in-progress'),
    })),
  selectSession: (sessionId) => set({ currentSessionId: sessionId }),
  createSession: () =>
    set((state) => ({
      sessions: [
        {
          id: `session-${Date.now()}`,
          title: '新研究会话',
          domain: '未命名研究主题',
          updatedAt: '刚刚',
          stageLabel: '领域探索',
        },
        ...state.sessions,
      ],
    })),
}));
