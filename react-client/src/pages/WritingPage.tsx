import { Copy, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AnnotationPanel, EditorialPage, SectionBlock, SideIndex } from '../components/ui/Primitives';
import { adaptWritingSections } from '../adapters/artifactAdapter';
import { getArtifactContent, getTaskOutput } from '../services/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function WritingPage() {
  const currentSessionId = useWorkspaceStore((state) => state.currentSessionId);
  const showToast = useWorkspaceStore((state) => state.showToast);
  const [writingSections, setWritingSections] = useState<Array<any>>([]);
  const [activeWritingSectionId, setActiveWritingSectionId] = useState('');
  const [paperUrl, setPaperUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentSessionId) {
      setWritingSections([]);
      setActiveWritingSectionId('');
      setPaperUrl(null);
      setError(null);
      return;
    }

    let cancelled = false;

    const loadWritingArtifacts = async () => {
      try {
        const [texResponse, outputResponse] = await Promise.all([
          getArtifactContent(currentSessionId, 'paper/paper.tex'),
          getTaskOutput(currentSessionId).catch(() => ({ paper_url: null })),
        ]);
        if (cancelled) {
          return;
        }

        const nextSections = adaptWritingSections(String(texResponse.content ?? ''));
        setWritingSections(nextSections);
        setActiveWritingSectionId(nextSections[0]?.id ?? '');
        setPaperUrl(outputResponse.paper_url ?? null);
        setError(null);
      } catch (artifactError) {
        if (!cancelled) {
          setError(artifactError instanceof Error ? artifactError.message : '论文产物尚未生成。');
        }
      }
    };

    void loadWritingArtifacts();

    return () => {
      cancelled = true;
    };
  }, [currentSessionId]);

  const activeSection = useMemo(
    () => writingSections.find((section) => section.id === activeWritingSectionId) ?? writingSections[0],
    [activeWritingSectionId, writingSections],
  );

  const copyToClipboard = async () => {
    if (!activeSection?.content) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activeSection.content);
      showToast('章节内容已复制到剪贴板');
    } catch {
      showToast('复制失败，请手动选择内容');
    }
  };

  return (
    <EditorialPage
      eyebrow="Paper Draft"
      title="预览论文章节，并把结构和内容保持在同一视图里"
      description={error ?? '这里展示 AI 生成的 LaTeX 章节草稿。左侧用于导航，中间阅读正文，右侧保留证据栏位。'}
      actions={
        <div className="chip-row">
          <button
            className="button-primary"
            onClick={() => {
              if (!paperUrl) {
                return;
              }
              const fullUrl = paperUrl.startsWith('http')
                ? paperUrl
                : `${import.meta.env.VITE_API_BASE ?? ''}${paperUrl}`;
              window.open(fullUrl, '_blank', 'noopener,noreferrer');
            }}
            type="button"
            disabled={!paperUrl}
          >
            <FileText size={14} />
            预览 PDF
          </button>
          {!paperUrl ? <span className="tiny muted">PDF 编译中...</span> : null}
        </div>
      }
    >
      <div className="editor-layout">
        <SideIndex items={writingSections} activeId={activeWritingSectionId} onChange={setActiveWritingSectionId} />

        <SectionBlock
          title={activeSection?.label ?? '暂无论文章节'}
          description={activeSection?.outline ?? '当前任务还没有可展示的论文章节。'}
          action={
            activeSection?.content ? (
              <button className="button-secondary" onClick={() => void copyToClipboard()} type="button">
                <Copy size={14} />
                复制内容
              </button>
            ) : undefined
          }
        >
          <div className="stack">
            <textarea
              className="text-area writing-preview"
              value={activeSection?.content ?? error ?? '正在加载章节内容...'}
              readOnly
            />
            <p className="tiny muted">
              当前编辑器为只读预览模式，目的是保证前端与后端生成内容一致。如需进一步修改，请复制后在本地 LaTeX 环境中处理。
            </p>
          </div>
        </SectionBlock>

        <AnnotationPanel title="章节证据链" items={activeSection?.evidence ?? ['暂无结构化证据链']} />
      </div>
    </EditorialPage>
  );
}
