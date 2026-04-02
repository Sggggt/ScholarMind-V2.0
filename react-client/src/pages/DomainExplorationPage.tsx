import { useEffect, useState } from 'react';
import { EditorialPage, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { adaptExplorationArtifacts, adaptLiteratureArtifacts } from '../adapters/artifactAdapter';
import { getArtifactContent } from '../services/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

const emptyExploration = {
  topic: '',
  summary: '',
  keywords: [] as string[],
  directions: [] as string[],
  authors: [] as string[],
  institutions: [] as string[],
  insight: '',
};

export default function DomainExplorationPage() {
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const currentTask = useWorkspaceStore((state) => state.currentTask);
  const [exploration, setExploration] = useState(emptyExploration);

  useEffect(() => {
    if (!currentTask) {
      setExploration(emptyExploration);
      return;
    }

    let cancelled = false;

    const loadExploration = async () => {
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
        setExploration(
          adaptExplorationArtifacts(
            currentTask.topic,
            currentTask.description,
            String(reviewResponse.content ?? ''),
            literature.papers,
          ),
        );
      } catch {
        if (!cancelled) {
          setExploration({
            topic: currentTask.topic,
            summary: currentTask.description || '任务已创建，等待真实探索产物同步。',
            keywords: currentTask.topic.split(/\s+/).filter(Boolean).slice(0, 6),
            directions: [],
            authors: [],
            institutions: [],
            insight: '当前阶段尚未读取到可用的探索产物。',
          });
        }
      }
    };

    void loadExploration();

    return () => {
      cancelled = true;
    };
  }, [currentTaskId, currentTask]);

  return (
    <EditorialPage
      eyebrow="Exploration"
      title="先建立研究边界，再进入文献与实验链条"
      description="领域探索页负责把任务主题压缩成可操作的问题空间：主题摘要、关键词、代表方向、主要作者与机构，都在这里形成初始地图。"
      actions={<StatusBadge status={exploration.topic ? 'completed' : 'not-started'} label={exploration.topic ? 'Ready' : 'No Task'} />}
    >
      <SectionBlock title="研究主题" description="这里是系统对当前任务的第一层聚焦。">
        <div className="editorial-lead">{exploration.topic || '尚未创建研究任务。'}</div>
      </SectionBlock>

      <div className="grid-two">
        <SectionBlock title="任务摘要" description="摘要来自文献综述与任务描述的合并视图。">
          <p className="page-description">{exploration.summary || '等待真实探索结论。'}</p>
        </SectionBlock>
        <SectionBlock title="关键洞察" description="保留一条面向下一步行动的结论。">
          <p className="page-description">{exploration.insight || '等待洞察生成。'}</p>
        </SectionBlock>
      </div>

      <div className="grid-two">
        <SectionBlock title="关键词簇" description="帮助后续检索和结果过滤。">
          <div className="chip-row">
            {(exploration.keywords.length ? exploration.keywords : ['等待关键词']).map((keyword) => (
              <span key={keyword} className="chip active">
                {keyword}
              </span>
            ))}
          </div>
        </SectionBlock>
        <SectionBlock title="代表方向" description="优先展示当前任务最值得继续跟进的方向。">
          <div className="ruled-list">
            {(exploration.directions.length ? exploration.directions : ['等待方向提炼']).map((direction) => (
              <div key={direction} className="ruled-list-item">
                {direction}
              </div>
            ))}
          </div>
        </SectionBlock>
      </div>

      <div className="grid-two">
        <SectionBlock title="代表作者" description="这些名字来自当前已解析的文献列表。">
          <div className="name-cloud">
            {(exploration.authors.length ? exploration.authors : ['等待作者线索']).map((author) => (
              <span key={author} className="annotation-pill">
                {author}
              </span>
            ))}
          </div>
        </SectionBlock>
        <SectionBlock title="代表机构" description="用机构分布感知当前证据主要来自哪里。">
          <div className="name-cloud">
            {(exploration.institutions.length ? exploration.institutions : ['等待机构线索']).map((institution) => (
              <span key={institution} className="annotation-pill">
                {institution}
              </span>
            ))}
          </div>
        </SectionBlock>
      </div>
    </EditorialPage>
  );
}