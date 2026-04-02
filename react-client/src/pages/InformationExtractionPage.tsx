import { useEffect, useMemo, useState } from 'react';
import { EditorialPage, SectionBlock, SideIndex } from '../components/ui/Primitives';
import { adaptExtractionArtifacts, adaptLiteratureArtifacts } from '../adapters/artifactAdapter';
import { getArtifactContent } from '../services/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function InformationExtractionPage() {
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const currentTask = useWorkspaceStore((state) => state.currentTask);
  const activePaperId = useWorkspaceStore((state) => state.activePaperId);
  const setActivePaper = useWorkspaceStore((state) => state.setActivePaper);
  const [papers, setPapers] = useState<Array<any>>([]);
  const [sections, setSections] = useState<Array<any>>([]);
  const [relations, setRelations] = useState<Array<any>>([]);
  const [activeSectionId, setActiveSectionId] = useState('contributions');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTaskId || !currentTask) {
      setPapers([]);
      setSections([]);
      setRelations([]);
      setError(null);
      return;
    }

    let cancelled = false;

    const loadArtifacts = async () => {
      try {
        const [sourcesResponse, reviewResponse] = await Promise.all([
          getArtifactContent(currentTaskId, 'm1_sources.json'),
          getArtifactContent(currentTaskId, 'm1_literature_review.md'),
        ]);
        if (cancelled) {
          return;
        }

        const literature = adaptLiteratureArtifacts(
          currentTask.topic,
          String(reviewResponse.content ?? ''),
          sourcesResponse.content,
        );
        const extraction = adaptExtractionArtifacts(String(reviewResponse.content ?? ''), literature.papers);

        setPapers(literature.papers);
        setSections(extraction.sections);
        setRelations(extraction.relations);
        setActiveSectionId(extraction.sections[0]?.id ?? 'contributions');
        setError(null);
      } catch (artifactError) {
        if (!cancelled) {
          setError(artifactError instanceof Error ? artifactError.message : '信息提取产物尚未生成。');
        }
      }
    };

    void loadArtifacts();

    return () => {
      cancelled = true;
    };
  }, [currentTaskId, currentTask]);

  const activePaper = useMemo(
    () => papers.find((paper) => paper.id === activePaperId) ?? papers[0],
    [activePaperId, papers],
  );
  const activeSection = useMemo(
    () => sections.find((section) => section.id === activeSectionId) ?? sections[0],
    [activeSectionId, sections],
  );

  return (
    <EditorialPage
      eyebrow="Evidence Extraction"
      title="围绕关键论文做聚焦式证据整理"
      description="布局采用左索引、中分析、右关系的三栏结构，目的是让证据、摘要与概念关系始终保持联动。"
    >
      <div className="right-rail-layout">
        <SideIndex items={sections} activeId={activeSectionId} onChange={setActiveSectionId} />

        <div className="stack">
          <SectionBlock
            title={activePaper?.title ?? '暂无可提取论文'}
            description={
              activePaper ? `${activePaper.authors} · ${activePaper.year} · ${activePaper.source}` : error ?? '当前任务还没有可用文献。'
            }
          >
            <div className="page-description">{activePaper?.abstract ?? error ?? '等待文献内容同步。'}</div>
            <div className="chip-row" style={{ marginTop: '18px' }}>
              {papers.map((paper) => (
                <button
                  key={paper.id}
                  className={`chip${paper.id === activePaper?.id ? ' active' : ''}`}
                  onClick={() => setActivePaper(paper.id)}
                  type="button"
                >
                  {paper.focus}
                </button>
              ))}
            </div>
          </SectionBlock>

          <SectionBlock
            title={activeSection?.label ?? '提取结果'}
            description="每个提取区块都把综合结论与引用性摘要放在同一视图中。"
          >
            <div className="stack">
              <p className="page-description">{activeSection?.summary ?? '等待真实提取结果。'}</p>
              {(activeSection?.quotes ?? []).map((quote: string) => (
                <div key={quote} className="list-card">
                  “{quote}”
                </div>
              ))}
            </div>
          </SectionBlock>
        </div>

        <SectionBlock title="概念关系" description="右侧只保留最必要的轻量关系，避免噪声过高。">
          <div className="stack">
            {(relations.length ? relations : [{ source: '等待', relation: '关联', target: '关系图' }]).map((relation) => (
              <div key={`${relation.source}-${relation.target}`} className="list-card">
                <strong>{relation.source}</strong>
                <div className="tiny muted">{relation.relation}</div>
                <strong>{relation.target}</strong>
              </div>
            ))}
          </div>
        </SectionBlock>
      </div>
    </EditorialPage>
  );
}