import { useDeferredValue, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EditorialPage,
  ResearchTable,
  SourceToggleGroup,
  StatusBadge,
} from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

const sourceOptions = ['arXiv', 'PubMed', 'Crossref', 'Semantic Scholar'];

export default function LiteraturePage() {
  const navigate = useNavigate();
  const selectedSources = useWorkspaceStore((state) => state.selectedSources);
  const toggleSource = useWorkspaceStore((state) => state.toggleSource);
  const literatureFilters = useWorkspaceStore((state) => state.literatureFilters);
  const updateLiteratureFilters = useWorkspaceStore((state) => state.updateLiteratureFilters);
  const papers = useWorkspaceStore((state) => state.papers);
  const collectionProgress = useWorkspaceStore((state) => state.collectionProgress);
  const isCollecting = useWorkspaceStore((state) => state.isCollecting);
  const startCollection = useWorkspaceStore((state) => state.startCollection);
  const setCollectionProgress = useWorkspaceStore((state) => state.setCollectionProgress);
  const finishCollection = useWorkspaceStore((state) => state.finishCollection);
  const selectPaper = useWorkspaceStore((state) => state.selectPaper);
  const deferredKeywords = useDeferredValue(literatureFilters.keywords);

  useEffect(() => {
    if (!isCollecting) return;

    const timer = window.setInterval(() => {
      const next = useWorkspaceStore.getState().collectionProgress + 16;
      if (next >= 100) {
        finishCollection();
        window.clearInterval(timer);
        return;
      }
      setCollectionProgress(next);
    }, 420);

    return () => window.clearInterval(timer);
  }, [finishCollection, isCollecting, setCollectionProgress]);

  const filteredRows = useMemo(() => {
    const query = deferredKeywords.toLowerCase();
    return papers.filter(
      (paper) =>
        paper.title.toLowerCase().includes(query) ||
        paper.focus.toLowerCase().includes(query) ||
        paper.source.toLowerCase().includes(query),
    );
  }, [deferredKeywords, papers]);

  const sourceDistribution = useMemo(() => {
    const total = papers.length || 1;
    return sourceOptions.map((source) => {
      const count = papers.filter((paper) => paper.source === source).length;
      return {
        source,
        count,
        ratio: Math.round((count / total) * 100),
      };
    });
  }, [papers]);

  return (
    <EditorialPage
      eyebrow="文献采集"
      title="把数据源选择、检索条件、采集进度和论文表收拢到一个工作面"
      description="这一页应像研究记录单，而不是堆满控件的后台页。筛选、进度和来源结构都应该服务于最后那张论文表。"
      actions={
        <button className="button-primary" onClick={startCollection} type="button">
          开始采集
        </button>
      }
    >
      <section className="literature-controls">
        <div className="literature-controls-top">
          <div>
            <div className="kicker">数据源</div>
            <SourceToggleGroup
              sources={sourceOptions}
              selectedSources={selectedSources}
              onToggle={toggleSource}
            />
          </div>
          <StatusBadge status={isCollecting ? 'in-progress' : 'completed'} />
        </div>

        <div className="literature-filter-grid">
          <label>
            <div className="kicker">研究主题</div>
            <input
              className="text-input"
              value={literatureFilters.topic}
              onChange={(event) => updateLiteratureFilters({ topic: event.target.value })}
            />
          </label>
          <label>
            <div className="kicker">关键词</div>
            <input
              className="text-input"
              value={literatureFilters.keywords}
              onChange={(event) => updateLiteratureFilters({ keywords: event.target.value })}
            />
          </label>
          <label>
            <div className="kicker">年份范围</div>
            <div className="toolbar-row">
              <input
                className="text-input"
                value={literatureFilters.yearStart}
                onChange={(event) =>
                  updateLiteratureFilters({ yearStart: Number(event.target.value) || 2020 })
                }
              />
              <input
                className="text-input"
                value={literatureFilters.yearEnd}
                onChange={(event) =>
                  updateLiteratureFilters({ yearEnd: Number(event.target.value) || 2025 })
                }
              />
            </div>
          </label>
        </div>
      </section>

      <section className="literature-overview">
        <div className="figure-block">
          <div className="figure-header">
            <div>
              <div className="kicker">采集进度</div>
              <h2 className="section-title">当前采集状态</h2>
            </div>
            <div className="figure-metric">{collectionProgress}%</div>
          </div>
          <div className="progress-track literature-progress-track">
            <div className="progress-fill" style={{ width: `${collectionProgress}%` }} />
          </div>
          <div className="figure-caption">进度条与状态保持在同一视线内，避免割裂的状态卡片。</div>
        </div>

        <div className="figure-block">
          <div className="figure-header">
            <div>
              <div className="kicker">来源分布</div>
              <h2 className="section-title">论文来源结构</h2>
            </div>
          </div>
          <div className="distribution-chart">
            {sourceDistribution.map((item) => (
              <div key={item.source} className="distribution-row">
                <div className="distribution-label">{item.source}</div>
                <div className="distribution-bar">
                  <div className="distribution-bar-fill" style={{ width: `${item.ratio}%` }} />
                </div>
                <div className="distribution-value">
                  {item.count} 篇 · {item.ratio}%
                </div>
              </div>
            ))}
          </div>
          <div className="figure-caption">来源分布保持低噪声，只回答“目前证据主要来自哪里”。</div>
        </div>
      </section>

      <section className="editorial-table-section">
        <div className="section-header">
          <div>
            <h2 className="section-title">论文表</h2>
            <div className="section-copy">主阅读面以论文表为核心，所有动作都从这里继续推进到信息提取。</div>
          </div>
        </div>

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
                <button className="button-secondary" type="button">
                  查看
                </button>
                <button
                  className="button-primary"
                  onClick={() => {
                    selectPaper(paper.id);
                    navigate('/extraction');
                  }}
                  type="button"
                >
                  进入提取
                </button>
              </div>
            ),
          }))}
        />
      </section>
    </EditorialPage>
  );
}
