import { EditorialPage, SectionBlock, SideIndex } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function InformationExtractionPage() {
  const papers = useWorkspaceStore((state) => state.papers);
  const activePaperId = useWorkspaceStore((state) => state.activePaperId);
  const selectPaper = useWorkspaceStore((state) => state.selectPaper);
  const sections = useWorkspaceStore((state) => state.extractionSections);
  const activeSectionId = useWorkspaceStore((state) => state.activeExtractionSectionId);
  const setExtractionSection = useWorkspaceStore((state) => state.setExtractionSection);
  const relations = useWorkspaceStore((state) => state.extractionRelations);

  const activePaper = papers.find((paper) => paper.id === activePaperId) ?? papers[0];
  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];

  return (
    <EditorialPage
      eyebrow="信息提取"
      title="围绕单篇关键论文做聚焦式分析"
      description="页面采用左侧提取索引、中央综合分析和右侧概念关系的连续布局，让证据与解释始终联动。"
    >
      <div className="right-rail-layout">
        <SideIndex items={sections} activeId={activeSectionId} onChange={setExtractionSection} />

        <div className="stack">
          <SectionBlock
            title={activePaper.title}
            description={`${activePaper.authors} · ${activePaper.year} · ${activePaper.source}`}
          >
            <div className="page-description">{activePaper.abstract}</div>
            <div className="chip-row" style={{ marginTop: 18 }}>
              {papers.map((paper) => (
                <button
                  key={paper.id}
                  className={`chip${paper.id === activePaperId ? ' active' : ''}`}
                  onClick={() => selectPaper(paper.id)}
                  type="button"
                >
                  {paper.focus}
                </button>
              ))}
            </div>
          </SectionBlock>

          <SectionBlock title={activeSection.label} description="AI 综合判断与源句引用保持在同一阅读区。">
            <div className="stack">
              <p className="page-description">{activeSection.summary}</p>
              {activeSection.quotes.map((quote) => (
                <div key={quote} className="list-card">
                  “{quote}”
                </div>
              ))}
            </div>
          </SectionBlock>
        </div>

        <SectionBlock title="概念关系" description="用轻量关系结构代替复杂的大图谱画布。">
          <div className="stack">
            {relations.map((relation) => (
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
