import { Code2, FileCode2, Folder, GitBranch } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EditorialPage, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { getRepoFile, getRepoTree, getArtifactContent } from '../services/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import type { BackendRepoTreeNode } from '../types/backend';

interface CodeGenInfo {
  file_count: number;
  idea_name: string;
  has_baseline: boolean;
  run_command?: string;
}

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

export default function CodeGenerationPage() {
  const navigate = useNavigate();
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const [tree, setTree] = useState<BackendRepoTreeNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  const [activeFilePath, setActiveFilePath] = useState('');
  const [activePreview, setActivePreview] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [codeGenInfo, setCodeGenInfo] = useState<CodeGenInfo | null>(null);

  useEffect(() => {
    if (!currentTaskId) {
      setTree([]);
      setExpandedFolders([]);
      setActiveFilePath('');
      setActivePreview('');
      setCodeGenInfo(null);
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
        setExpandedFolders(
          nextTree.filter((node) => node.kind === 'folder').map((node) => node.path)
        );
        setActiveFilePath(firstFile);
        setError(null);
      } catch (repoError) {
        if (!cancelled) {
          setError(
            repoError instanceof Error ? repoError.message : '代码仓库尚未生成。'
          );
        }
      }
    };

    const loadCodeGenInfo = async () => {
      try {
        const response = await getArtifactContent(currentTaskId, 'm4_code_gen_info.json');
        if (!cancelled) {
          setCodeGenInfo(response.content as CodeGenInfo);
        }
      } catch {
        // 如果没有专门的 info 文件，尝试从树推断
        if (!cancelled && tree.length > 0) {
          setCodeGenInfo({
            file_count: tree.length,
            idea_name: 'experiment',
            has_baseline: false,
          });
        }
      }
    };

    void loadRepo();
    void loadCodeGenInfo();

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
          setError(
            repoError instanceof Error ? repoError.message : '文件读取失败。'
          );
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
                  : [...current, node.path]
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

  const activeFileName = useMemo(
    () => activeFilePath.split('/').pop() ?? '文件',
    [activeFilePath]
  );

  const totalFiles = useMemo(() => {
    const countFiles = (nodes: BackendRepoTreeNode[]): number => {
      return nodes.reduce((acc, node) => {
        if (node.kind === 'file') {
          return acc + 1;
        }
        if (node.children) {
          return acc + countFiles(node.children);
        }
        return acc;
      }, 0);
    };
    return countFiles(tree);
  }, [tree]);

  return (
    <EditorialPage
      eyebrow="Code Generation (M4)"
      title="基于研究 Idea 自动生成的代码仓库"
      description={
        error ??
        'M4 模块使用 Aider AI 编码助手将研究 Idea 转换为可执行的实验代码。'
      }
      actions={
        <div className="flex items-center gap-2">
          <StatusBadge
            status={tree.length ? 'completed' : 'not-started'}
            label={tree.length ? `${totalFiles} 个文件` : '等待生成'}
          />
          {tree.length > 0 && (
            <button
              className="button-secondary"
              onClick={() => navigate('/experiment')}
              type="button"
            >
              查看实验设计
            </button>
          )}
        </div>
      }
    >
      <div className="stack">
        {/* 代码生成信息概览 */}
        <SectionBlock title="生成概览" description="M4 代码生成模块的输出摘要">
          <div className="grid-two">
            <div className="stack">
              <label className="form-row">
                <span className="form-label">Idea 名称</span>
                <input
                  className="text-input"
                  value={codeGenInfo?.idea_name ?? '等待代码生成'}
                  readOnly
                />
              </label>
              <label className="form-row">
                <span className="form-label">文件总数</span>
                <input
                  className="text-input"
                  value={tree.length > 0 ? `${totalFiles} 个文件` : '计算中...'}
                  readOnly
                />
              </label>
            </div>
            <div className="stack">
              <label className="form-row">
                <span className="form-label">Baseline 已运行</span>
                <input
                  className="text-input"
                  value={codeGenInfo?.has_baseline ? '是' : '否'}
                  readOnly
                />
              </label>
              <label className="form-row">
                <span className="form-label">运行命令</span>
                <input
                  className="text-input"
                  value={codeGenInfo?.run_command ?? 'python experiment.py --out_dir=run_1'}
                  readOnly
                />
              </label>
            </div>
          </div>
        </SectionBlock>

        {/* 代码仓库浏览器 */}
        <SectionBlock
          title="代码仓库"
          description="浏览生成的代码文件。点击文件查看内容。"
        >
          <div className="repo-shell">
            <div className="repo-tree">
              {tree.length ? (
                tree.map((node) => renderNode(node))
              ) : (
                <div className="empty-state">
                  <Code2 size={32} className="muted" />
                  <p>代码仓库尚未生成</p>
                  <p className="text-sm text-muted">
                    完成构思生成后，M4 模块将自动生成代码仓库
                  </p>
                </div>
              )}
            </div>

            {tree.length > 0 && (
              <div className="repo-reader">
                <div className="repo-reader-title">
                  {activeFilePath || '选择一个文件开始阅读。'}
                </div>
                <pre>
                  {activePreview || error || '选择一个文件开始阅读。'}
                </pre>
              </div>
            )}
          </div>
        </SectionBlock>
      </div>
    </EditorialPage>
  );
}

// Chevron icons
function ChevronDown({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ChevronRight({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
