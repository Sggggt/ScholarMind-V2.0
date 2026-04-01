import { EditorialPage, SectionBlock } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function RepositoryPage() {
  const files = useWorkspaceStore((state) => state.repositoryFiles);
  const activeFileId = useWorkspaceStore((state) => state.activeRepositoryFileId);
  const setRepositoryFile = useWorkspaceStore((state) => state.setRepositoryFile);

  const activeFile = files.find((file) => file.id === activeFileId) ?? files[0];

  return (
    <EditorialPage
      eyebrow="资料库"
      title="在左树右预览布局中查看研究资产与配置片段"
      description="资料库页是研究成果与实现资料之间的连接面。"
    >
      <div className="split-view">
        <SectionBlock title="文件树" description="左侧文件树，右侧内容预览。">
          <div className="stack">
            {files.map((file) => (
              <button
                key={file.id}
                className={`session-item${file.id === activeFileId ? ' active' : ''}`}
                onClick={() => setRepositoryFile(file.id)}
                type="button"
              >
                <div style={{ flex: 1, textAlign: 'left' }}>{file.label}</div>
              </button>
            ))}
          </div>
        </SectionBlock>

        <SectionBlock title={activeFile.label} description="README 与配置片段以连续方式阅读。">
          <pre>{activeFile.preview}</pre>
        </SectionBlock>
      </div>
    </EditorialPage>
  );
}
