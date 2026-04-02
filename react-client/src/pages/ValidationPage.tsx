import { CheckCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { DecisionRail, EditorialPage, SectionBlock, StatusBadge } from '../components/ui/Primitives';
import { adaptValidationClaims } from '../adapters/artifactAdapter';
import { getReviewReport } from '../services/api';
import { useWorkspaceStore } from '../store/useWorkspaceStore';

export default function ValidationPage() {
  const currentTaskId = useWorkspaceStore((state) => state.currentTaskId);
  const [claims, setClaims] = useState<Array<any>>([]);
  const [resolvedClaimIds, setResolvedClaimIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentTaskId) {
      setClaims([]);
      setResolvedClaimIds([]);
      setError(null);
      return;
    }

    let cancelled = false;

    const loadReviewReport = async () => {
      try {
        const report = await getReviewReport(currentTaskId);
        if (cancelled) {
          return;
        }
        setClaims(adaptValidationClaims(report));
        setError(null);
      } catch (artifactError) {
        if (!cancelled) {
          setError(artifactError instanceof Error ? artifactError.message : '评审报告尚未生成。');
        }
      }
    };

    void loadReviewReport();

    return () => {
      cancelled = true;
    };
  }, [currentTaskId]);

  const riskItems = useMemo(
    () =>
      claims.map((claim) => ({
        label: claim.risk === 'high' ? '高风险' : claim.risk === 'medium' ? '中风险' : '低风险',
        description: claim.claim,
      })),
    [claims],
  );

  return (
    <EditorialPage
      eyebrow="Validation"
      title="在最终结论前做论断核查、证据溯源与审稿式检查"
      description={error ?? '验证页是最终质量关口。每条论断都需要配套证据、审稿意见和明确的处理状态。'}
    >
      <div className="split-view">
        <SectionBlock title="论断列表" description="每条论断都绑定证据与评审注释。">
          <div className="stack">
            {claims.map((claim) => {
              const resolved = resolvedClaimIds.includes(claim.id);
              return (
                <div key={claim.id} className="list-card">
                  <div className="space-between">
                    <strong>{claim.claim}</strong>
                    <button
                      className={resolved ? 'button-secondary' : 'button-primary'}
                      onClick={() =>
                        setResolvedClaimIds((current) =>
                          current.includes(claim.id)
                            ? current.filter((id) => id !== claim.id)
                            : [...current, claim.id],
                        )
                      }
                      type="button"
                    >
                      <CheckCheck size={14} />
                      {resolved ? '已处理' : '标记处理'}
                    </button>
                  </div>
                  <div className="tiny muted">{claim.reviewerNote}</div>
                  <div className="chip-row" style={{ marginTop: '12px' }}>
                    {(claim.evidence ?? []).map((item: string) => (
                      <span key={item} className="chip">
                        {item}
                      </span>
                    ))}
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <StatusBadge
                      status={claim.risk === 'high' ? 'risk' : claim.risk === 'medium' ? 'in-progress' : 'completed'}
                      label={claim.risk}
                    />
                  </div>
                </div>
              );
            })}
            {!claims.length ? <div className="empty-state">{error ?? '等待评审验证结果。'}</div> : null}
          </div>
        </SectionBlock>

        <DecisionRail
          title="风险提醒"
          items={
            riskItems.length
              ? riskItems
              : [{ label: '等待评审', description: error ?? '当前还没有可展示的验证结论。' }]
          }
        />
      </div>
    </EditorialPage>
  );
}