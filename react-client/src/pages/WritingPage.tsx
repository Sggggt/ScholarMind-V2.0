import { Copy, FileText, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AnnotationPanel, EditorialPage, SectionBlock, SideIndex } from '../components/ui/Primitives';
import { adaptWritingSections } from '../adapters/artifactAdapter';
import { getArtifactContent, getTaskOutput, recompilePaperPdf } from '../services/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function WritingPage() {
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const showToast = useWorkspaceStore((state) => state.showToast);
  const [writingSections, setWritingSections] = useState<Array<any>>([]);
  const [activeWritingSectionId, setActiveWritingSectionId] = useState('');
  const [paperUrl, setPaperUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecompiling, setIsRecompiling] = useState(false);

  useEffect(() => {
    if (!currentTaskId) {
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
          getArtifactContent(currentTaskId, 'paper/paper.tex'),
          getTaskOutput(currentTaskId).catch(() => ({ paper_url: null })),
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
  }, [currentTaskId]);

  const activeSection = useMemo(
    () => writingSections.find((section) => section.id === activeWritingSectionId) ?? writingSections[0],
    [activeWritingSectionId, writingSections],
  );

  const resolvedPaperUrl = useMemo(() => {
    if (!paperUrl) {
      return null;
    }
    if (paperUrl.startsWith('http') || paperUrl.startsWith('/api/') || paperUrl.startsWith('/files/')) {
      return paperUrl;
    }
    const apiBase = import.meta.env.VITE_API_BASE ?? '';
    return `${apiBase}${paperUrl}`;
  }, [paperUrl]);

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

  const recompilePdf = async () => {
    if (!currentTaskId || isRecompiling) {
      return;
    }

    setIsRecompiling(true);
    try {
      const result = await recompilePaperPdf(currentTaskId);
      if (result.ok) {
        showToast(result.message || 'PDF 编译成功');
        // 刷新 PDF URL
        const outputResponse = await getTaskOutput(currentTaskId);
        setPaperUrl(outputResponse.paper_url ?? null);
        // 添加时间戳强制刷新
        setPaperUrl((prev) => {
          const baseUrl = prev?.split('?')[0] ?? '/api/files/' + currentTaskId + '/paper/paper.pdf';
          return `${baseUrl}?t=${Date.now()}`;
        });
      } else {
        showToast('PDF 编译失败: ' + (result.message || '未知错误'));
      }
    } catch (err) {
      showToast('PDF 编译请求失败，请稍后重试');
    } finally {
      setIsRecompiling(false);
    }
  };

  return (
    <EditorialPage
      eyebrow="Paper Draft"
      title="预览论文章节，并把结构和内容保持在同一视图里"
      description={error ?? '这里展示 AI 生成的 LaTeX 章节草稿。左侧用于导航，中间阅读正文，右侧保留证据栏位。'}
      actions={
        <div className="chip-row">
          {paperUrl ? (
            <a
              className="button-primary"
              href={resolvedPaperUrl ?? paperUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', cursor: 'pointer' }}
            >
              <FileText size={14} />
              预览 PDF
            </a>
          ) : (
            <>
              <button className="button-primary" disabled type="button">
                <FileText size={14} />
                预览 PDF
              </button>
              <span className="tiny muted">PDF 编译中...</span>
            </>
          )}
          <button
            className="button-secondary"
            onClick={() => void recompilePdf()}
            disabled={isRecompiling || !currentTaskId}
            type="button"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              cursor: isRecompiling ? 'wait' : 'pointer',
              opacity: isRecompiling ? 0.7 : 1,
            }}
          >
            <RefreshCw
              size={14}
              style={{
                animation: isRecompiling ? 'spin 1s linear infinite' : 'none',
              }}
            />
            {isRecompiling ? '编译中...' : '重新编译 PDF'}
          </button>
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
