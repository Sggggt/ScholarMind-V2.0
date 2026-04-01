import { DecisionRail, EditorialPage, SectionBlock } from '../components/ui/Primitives';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function ValidationPage() {
  const claims = useWorkspaceStore((state) => state.validationClaims);
  const resolvedClaimIds = useWorkspaceStore((state) => state.resolvedClaimIds);
  const toggleResolvedClaim = useWorkspaceStore((state) => state.toggleResolvedClaim);

  return (
    <EditorialPage
      eyebrow="结论验证"
      title="做论断核查、引用溯源和审稿式检查"
      description="验证页是最终质量关口，每条论断都要对应可追踪证据和明确风险说明。"
    >
      <div className="split-view">
        <SectionBlock title="论断列表" description="每条论断都绑定证据和审稿意见。">
          <div className="stack">
            {claims.map((claim) => {
              const resolved = resolvedClaimIds.includes(claim.id);
              return (
                <div key={claim.id} className="list-card">
                  <div className="space-between">
                    <strong>{claim.claim}</strong>
                    <button
                      className={resolved ? 'button-secondary' : 'button-primary'}
                      onClick={() => toggleResolvedClaim(claim.id)}
                      type="button"
                    >
                      {resolved ? '已处理' : '处理'}
                    </button>
                  </div>
                  <div className="tiny muted">{claim.reviewerNote}</div>
                  <div className="chip-row" style={{ marginTop: 12 }}>
                    {claim.evidence.map((item) => (
                      <span key={item} className="chip">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </SectionBlock>

        <DecisionRail
          title="风险提醒"
          items={claims.map((claim) => ({
            label: claim.risk === 'high' ? '高风险' : claim.risk === 'medium' ? '中风险' : '低风险',
            description: claim.claim,
          }))}
        />
      </div>
    </EditorialPage>
  );
}
