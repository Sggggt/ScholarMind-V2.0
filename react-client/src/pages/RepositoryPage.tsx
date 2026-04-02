import { ChevronDown, ChevronRight, FileCode2, Folder } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { EditorialPage, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { getRepoFile, getRepoTree } from '../services/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { BackendRepoTreeNode } from '../types/backend';

function findFirstFile(nodes: BackendRepoTreeNode[]): string {
  for (const node of nodes) {
    if (node.kind === 'file') {
      return node.path;
    }

    if (node.children?.length) {
      const path = findFirstFile(node.children);
      if (path) {
        return path;
      }
    }
  }

  return '';
}

export default function RepositoryPage() {
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const [tree, setTree] = useState<BackendRepoTreeNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  const [activeFilePath, setActiveFilePath] = useState('');
  const [activePreview, setActivePreview] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTaskId) {
      setTree([]);
      setExpandedFolders([]);
      setActiveFilePath('');
      setActivePreview('');
      setError(null);
      return;
    }

    let cancelled = false;

    const loadRepo = async () => {
      try {
        const nextTree = await getRepoTree(currentTaskId);
        if (cancelled) {
          return;
        }

        const firstFile = findFirstFile(nextTree);
        setTree(nextTree);
        setExpandedFolders(nextTree.filter((node) => node.kind === 'folder').map((node) => node.path));
        setActiveFilePath(firstFile);
        setError(null);
      } catch (repoError) {
        if (!cancelled) {
          setError(repoError instanceof Error ? repoError.message : '当前任务还没有可读代码仓库。');
        }
      }
    };

    void loadRepo();

    return () => {
      cancelled = true;
    };
  }, [currentTaskId]);

  useEffect(() => {
    if (!currentTaskId || !activeFilePath) {
      setActivePreview('');
      return;
    }

    let cancelled = false;

    const loadFile = async () => {
      try {
        const response = await getRepoFile(currentTaskId, activeFilePath);
        if (!cancelled) {
          setActivePreview(response.content);
          setError(null);
        }
      } catch (repoError) {
        if (!cancelled) {
          setError(repoError instanceof Error ? repoError.message : '文件读取失败。');
        }
      }
    };

    void loadFile();

    return () => {
      cancelled = true;
    };
  }, [activeFilePath, currentTaskId]);

  const renderNode = (node: BackendRepoTreeNode, depth = 0) => {
    const expanded = expandedFolders.includes(node.path);

    if (node.kind === 'folder') {
      return (
        <div key={node.path}>
          <button
            className="repo-node"
            onClick={() =>
              setExpandedFolders((current) =>
                current.includes(node.path)
                  ? current.filter((item) => item !== node.path)
                  : [...current, node.path],
              )
            }
            style={{ paddingLeft: `${depth * 18 + 8}px` }}
            type="button"
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <Folder size={14} />
            <span>{node.name}</span>
          </button>
          {expanded ? node.children?.map((child) => renderNode(child, depth + 1)) : null}
        </div>
      );
    }

    return (
      <button
        key={node.path}
        className={`repo-node file${activeFilePath === node.path ? ' active' : ''}`}
        onClick={() => setActiveFilePath(node.path)}
        style={{ paddingLeft: `${depth * 18 + 28}px` }}
        type="button"
      >
        <FileCode2 size={14} />
        <span>{node.name}</span>
      </button>
    );
  };

  const activeFileName = useMemo(() => activeFilePath.split('/').pop() ?? '文件', [activeFilePath]);

  return (
    <EditorialPage
      eyebrow="Repository"
      title="浏览当前任务生成的代码仓库与文件内容"
      description={error ?? '左侧目录树，右侧文件正文。保持阅读优先，不引入多余 IDE 式噪声。'}
      actions={<StatusBadge status={tree.length ? 'completed' : 'not-started'} label={tree.length ? 'Repo Ready' : 'Waiting'} />}
    >
      <div className="repo-shell">
        <SectionBlock title="目录树" description="点击文件后，右侧预览会同步刷新。">
          <div className="repo-tree">
            {tree.length ? tree.map((node) => renderNode(node)) : <div className="empty-state">暂无仓库目录。</div>}
          </div>
        </SectionBlock>

        <SectionBlock title={activeFileName} description={activeFilePath || '选择一个文件开始阅读。'}>
          <div className="repo-reader">
            <div className="repo-reader-title">{activeFilePath || 'No file selected'}</div>
            <pre>{activePreview || error || '选择一个文件开始阅读。'}</pre>
          </div>
        </SectionBlock>
      </div>
    </EditorialPage>
  );
}