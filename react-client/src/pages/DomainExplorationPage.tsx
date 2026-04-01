import { EditorialPage } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function DomainExplorationPage() {
  const exploration = useWorkspaceStore((state) => state.exploration);
  const updateTopic = useWorkspaceStore((state) => state.updateTopic);

  return (
    <EditorialPage
      eyebrow="领域探索"
      title="先定义主题框架，再推进到文献、提取与趋势阶段"
      description="这一页负责建立整个研究会话的主题边界、关键词体系与方向判断。结构尽量保持连续，避免把同一组思考切碎成很多小卡片。"
    >
      <div className="exploration-layout">
        <div className="exploration-main">
          <section className="editorial-strip">
            <div className="editorial-strip-header">
              <div>
                <div className="kicker">主题框架</div>
                <h2 className="section-title">研究问题与检索边界</h2>
              </div>
            </div>

            <label className="editorial-input-block">
              <span className="editorial-input-label">研究主题</span>
              <input
                className="text-input"
                value={exploration.topic}
                onChange={(event) => updateTopic(event.target.value)}
              />
            </label>

            <p className="editorial-lead">{exploration.summary}</p>
          </section>

          <section className="editorial-strip">
            <div className="exploration-columns">
              <div>
                <div className="kicker">关键词体系</div>
                <div className="chip-row exploration-chip-row">
                  {exploration.keywords.map((keyword) => (
                    <span key={keyword} className="chip active">
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="kicker">方向判断</div>
                <div className="ruled-list">
                  {exploration.directions.map((direction) => (
                    <div key={direction} className="ruled-list-item">
                      {direction}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="editorial-strip">
            <div className="exploration-columns">
              <div>
                <div className="kicker">代表作者</div>
                <div className="name-cloud">
                  {exploration.authors.map((author) => (
                    <span key={author} className="annotation-pill">
                      {author}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="kicker">代表机构</div>
                <div className="name-cloud">
                  {exploration.institutions.map((institution) => (
                    <span key={institution} className="annotation-pill">
                      {institution}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="editorial-strip insight-strip">
            <div className="kicker">AI 洞察</div>
            <p className="editorial-lead">{exploration.insight}</p>
          </section>
        </div>

        <aside className="exploration-rail">
          <div className="annotation-panel-shell">
            <div className="kicker">研究提示</div>
            <div className="stack">
              <div className="tiny muted">优先保持关键词、方向和代表作者在同一语义框架内。</div>
              <div className="tiny muted">这一页的输出将直接进入文献采集页的检索条件。</div>
              <div className="tiny muted">洞察结论应尽量服务于下一步缺口判断，而不是停留在概览层。</div>
            </div>
          </div>
        </aside>
      </div>
    </EditorialPage>
  );
}
