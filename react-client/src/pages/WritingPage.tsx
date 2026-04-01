import { AnnotationPanel, EditorialPage, SectionBlock, SideIndex } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function WritingPage() {
  const writingSections = useWorkspaceStore((state) => state.writingSections);
  const activeWritingSectionId = useWorkspaceStore((state) => state.activeWritingSectionId);
  const setWritingSection = useWorkspaceStore((state) => state.setWritingSection);
  const updateWritingContent = useWorkspaceStore((state) => state.updateWritingContent);

  const activeSection =
    writingSections.find((section) => section.id === activeWritingSectionId) ?? writingSections[0];

  return (
    <EditorialPage
      eyebrow="论文写作"
      title="以论文为中心的编辑器，保持大纲与证据同时可见"
      description="写作页把章节导航、正文编辑和证据挂接放在同一工作面中。"
    >
      <div className="editor-layout">
        <SideIndex items={writingSections} activeId={activeWritingSectionId} onChange={setWritingSection} />

        <SectionBlock title={activeSection.label} description={activeSection.outline}>
          <textarea
            className="text-area"
            value={activeSection.content}
            onChange={(event) => updateWritingContent(activeSection.id, event.target.value)}
            style={{ minHeight: 360 }}
          />
        </SectionBlock>

        <AnnotationPanel title="证据链接" items={activeSection.evidence} />
      </div>
    </EditorialPage>
  );
}
