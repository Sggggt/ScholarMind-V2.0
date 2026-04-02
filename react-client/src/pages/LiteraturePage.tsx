import { ArrowRight, Bot } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EditorialPage,
  ResearchTable,
  SectionBlock,
  SourceToggleGroup,
  StatusBadge,
} from '../components/ui/Primitives';
import { adaptLiteratureArtifacts } from '../adapters/artifactAdapter';
import { getArtifactContent } from '../services/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

type LiteraturePaper = {
  id: string;
  title: string;
  source: string;
  url?: string;
  year: number;
  authors: string;
  focus: string;
  status: string;
  citations: number;
  abstract: string;
};

function normalizeFilterText(text: string) {
  return text
    .replace(/\bLatest request\s*:\s*/gi, ' ')
    .replace(/[：:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeKeywords(text: string) {
  return Array.from(
    new Set(
      normalizeFilterText(text)
        .toLowerCase()
        .split(/[\s,，。;；、()（）[\]/\\|]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !['latest', 'request'].includes(token)),
    ),
  );
}

export default function LiteraturePage() {
  const navigate = useNavigate();
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const currentTask = useWorkspaceStore((state) => state.currentTask);
  const setActivePaper = useWorkspaceStore((state) => state.setActivePaper);
  const showToast = useWorkspaceStore((state) => state.showToast);
  const [summary, setSummary] = useState('');
  const [availableSources, setAvailableSources] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [literatureFilters, setLiteratureFilters] = useState({
    topic: normalizeFilterText(currentTask?.topic ?? ''),
    keywords: normalizeFilterText(currentTask?.topic ?? ''),
    yearStart: new Date().getFullYear() - 5,
    yearEnd: new Date().getFullYear(),
  });
  const [papers, setPapers] = useState<LiteraturePaper[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deferredKeywords = useDeferredValue(literatureFilters.keywords);

  useEffect(() => {
    if (!currentTaskId || !currentTask) {
      setSummary('');
      setAvailableSources([]);
      setSelectedSources([]);
      setPapers([]);
      setError(null);
      return;
    }

    let cancelled = false;

    const loadArtifacts = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [sourcesResponse, reviewResponse] = await Promise.all([
          getArtifactContent(currentTaskId, 'm1_sources.json'),
          getArtifactContent(currentTaskId, 'm1_literature_review.md'),
        ]);
        if (cancelled) {
          return;
        }

        const adapted = adaptLiteratureArtifacts(
          currentTask.topic,
          String(reviewResponse.content ?? ''),
          sourcesResponse.content,
        );

        setSummary(adapted.summary);
        setPapers(adapted.papers);
        setAvailableSources(adapted.selectedSources);
        setSelectedSources(adapted.selectedSources);
        setLiteratureFilters({
          ...adapted.filters,
          topic: normalizeFilterText(adapted.filters.topic),
          keywords: normalizeFilterText(adapted.filters.keywords),
        });
      } catch (artifactError) {
        if (!cancelled) {
          setError(artifactError instanceof Error ? artifactError.message : '文献产物尚未生成。');
          setSummary('');
          setPapers([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadArtifacts();

    return () => {
      cancelled = true;
    };
  }, [currentTaskId, currentTask]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = normalizeFilterText(deferredKeywords).toLowerCase();
    const keywordTokens = tokenizeKeywords(deferredKeywords);

    return papers.filter(
      (paper) => {
        if (paper.year < literatureFilters.yearStart || paper.year > literatureFilters.yearEnd) {
          return false;
        }

        if (selectedSources.length && !selectedSources.includes(paper.source)) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const haystack = `${paper.title} ${paper.focus} ${paper.source} ${paper.authors}`.toLowerCase();

        if (haystack.includes(normalizedQuery)) {
          return true;
        }

        return keywordTokens.some((token) => haystack.includes(token));
      },
    );
  }, [deferredKeywords, literatureFilters.yearEnd, literatureFilters.yearStart, papers, selectedSources]);

  const sourceDistribution = useMemo(() => {
    const total = papers.length || 1;
    const sources = selectedSources.length
      ? selectedSources
      : Array.from(new Set(papers.map((paper) => paper.source)));

    return sources.map((source) => {
      const count = papers.filter((paper) => paper.source === source).length;
      return {
        source,
        count,
        ratio: Math.round((count / total) * 100),
      };
    });
  }, [papers, selectedSources]);

  const m1Module = currentTask?.modules.find((module) => module.module_id === 'M1');
  const collectionProgress = Math.round(m1Module?.percent ?? 0);
  const isCollecting = m1Module?.status === 'running';

  const openPaper = (paper: LiteraturePaper) => {
    setActivePaper(paper.id);

    if (paper.url) {
      window.open(paper.url, '_blank', 'noopener,noreferrer');
      return;
    }

    showToast('当前文献没有原始链接，已切换到信息提取页查看摘要。');
    navigate('/gaps');
  };

  return (
    <EditorialPage
      eyebrow="Literature Review"
      title="把检索条件、进度、来源结构与论文表收拢到一个研究工作台"
      description="这里不是后台管理页，而是一张持续更新的文献工作台。先看来源与分布，再落到具体论文和后续提取动作。"
      actions={
        <button
          className="button-primary"
          onClick={() => navigate(currentTaskId ? '/agent-run' : '/workspace')}
          type="button"
        >
          <Bot size={14} />
          {currentTaskId ? '查看实时运行' : '前往工作台'}
        </button>
      }
    >
      <SectionBlock
        title="检索面板"
        description="当前来源开关、主题与年份范围都服务于下方这张论文表。"
        action={<StatusBadge status={isCollecting ? 'in-progress' : papers.length ? 'completed' : 'not-started'} />}
      >
        <div className="stack">
          <div>
            <div className="kicker">数据来源</div>
            <SourceToggleGroup
              sources={availableSources.length ? availableSources : ['等待真实来源']}
              selectedSources={selectedSources}
              onToggle={(source) =>
                setSelectedSources((current) =>
                  current.includes(source) ? current.filter((item) => item !== source) : [...current, source],
                )
              }
            />
          </div>

          <div className="field-grid">
            <label className="form-row">
              <span className="form-label">研究主题</span>
              <input
                className="text-input"
                value={literatureFilters.topic}
                onChange={(event) => setLiteratureFilters((current) => ({ ...current, topic: event.target.value }))}
                type="text"
              />
            </label>
            <label className="form-row">
              <span className="form-label">关键词</span>
              <input
                className="text-input"
                value={literatureFilters.keywords}
                onChange={(event) =>
                  setLiteratureFilters((current) => ({ ...current, keywords: event.target.value }))
                }
                type="text"
              />
            </label>
            <label className="form-row">
              <span className="form-label">年份范围</span>
              <div className="toolbar-row">
                <input
                  className="text-input"
                  value={literatureFilters.yearStart}
                  onChange={(event) =>
                    setLiteratureFilters((current) => ({
                      ...current,
                      yearStart: Number(event.target.value) || current.yearStart,
                    }))
                  }
                  type="number"
                />
                <input
                  className="text-input"
                  value={literatureFilters.yearEnd}
                  onChange={(event) =>
                    setLiteratureFilters((current) => ({
                      ...current,
                      yearEnd: Number(event.target.value) || current.yearEnd,
                    }))
                  }
                  type="number"
                />
              </div>
            </label>
          </div>
        </div>
      </SectionBlock>

      <div className="grid-two">
        <SectionBlock title="综述摘要" description="直接展示当前任务从 M1 产物整理出来的核心综述。">
          <div className="page-description">
            {isLoading ? '正在加载真实文献产物...' : summary || error || '当前任务还没有生成文献综述。'}
          </div>
        </SectionBlock>
        <SectionBlock title="采集状态" description="进度来自真实模块状态，而不是前端模拟。">
          <div className="progress-container-modern">
            <div className="progress-header">
              <span className="progress-percent">{collectionProgress}%</span>
              <span className="tiny muted">{isCollecting ? 'M1 运行中' : '等待更新'}</span>
            </div>
            <div className="progress-track-modern">
              <div className="progress-fill-modern" style={{ width: `${collectionProgress}%` }} />
            </div>
          </div>
          <div className="distribution-chart" style={{ marginTop: '18px' }}>
            {sourceDistribution.map((item) => (
              <div key={item.source} className="distribution-row">
                <div className="distribution-label">{item.source}</div>
                <div className="distribution-bar">
                  <div className="distribution-bar-fill" style={{ width: `${item.ratio}%` }} />
                </div>
                <div className="distribution-value">
                  {item.count} 篇 / {item.ratio}%
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>
      </div>

      <SectionBlock
        title="论文清单"
        description="所有后续动作都从这张表继续推进到信息提取。"
        action={<StatusBadge status={filteredRows.length ? 'completed' : 'not-started'} label={`${filteredRows.length} 篇`} />}
      >
        <ResearchTable
          columns={[
            { key: 'title', label: '论文' },
            { key: 'source', label: '来源' },
            { key: 'year', label: '年份' },
            { key: 'status', label: '状态' },
            { key: 'actions', label: '操作' },
          ]}
          rows={filteredRows.map((paper) => ({
            title: (
              <div>
                <strong>{paper.title}</strong>
                <div className="tiny muted">{paper.authors}</div>
              </div>
            ),
            source: (
              <div>
                <div>{paper.source}</div>
                <div className="tiny muted">{paper.focus}</div>
              </div>
            ),
            year: paper.year,
            status: (
              <StatusBadge
                status={paper.status === 'queued' ? 'not-started' : 'completed'}
                label={paper.status === 'queued' ? '待处理' : paper.status === 'selected' ? '已选中' : '已提取'}
              />
            ),
            actions: (
              <div className="toolbar-row">
                <button className="button-secondary" onClick={() => openPaper(paper)} type="button">
                  {paper.url ? '查看原文' : '查看摘要'}
                </button>
                <button
                  className="button-primary"
                  onClick={() => {
                    setActivePaper(paper.id);
                    navigate('/gaps');
                  }}
                  type="button"
                >
                  <ArrowRight size={14} />
                  进入提取
                </button>
              </div>
            ),
          }))}
        />
      </SectionBlock>
    </EditorialPage>
  );
}
