import { ArrowLeft, ArrowRight, Check, ChevronRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { WorkflowTaskActions } from './TaskCommandBar';
import { routeMeta } from '../../data/routeData';
import type { RunLog, RunStep, WorkflowStage, WorkflowStatus } from '../../types/app';

const statusLabelMap: Record<WorkflowStatus, string> = {
  'not-started': '待开始',
  'in-progress': '进行中',
  completed: '已完成',
  risk: '风险',
};

export function StatusBadge({ status, label }: { status: WorkflowStatus; label?: string }) {
  return <span className={`status-badge status-${status}`}>{label ?? statusLabelMap[status]}</span>;
}

export function EditorialPage({
  eyebrow,
  title,
  description,
  actions,
  children,
}: PropsWithChildren<{
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}>) {
  const location = useLocation();
  const navigate = useNavigate();
  const route = routeMeta.find((item) => item.path === location.pathname);
  const isStagePage = !!route && route.section === 'workflow' && route.id !== 'workflow';
  const shouldShowWorkflowTaskActions = !!route && route.section === 'workflow';
  const hasPageActions = shouldShowWorkflowTaskActions || !!actions;

  return (
    <div className="canvas editorial-page" aria-label={title}>
      <div className="page-hero">
        <div className="page-head">
          <div>
            {isStagePage ? (
              <button className="crumb-button" onClick={() => navigate('/workflow')} type="button">
                <ArrowLeft size={14} />
                返回流程
              </button>
            ) : null}
            <div className="eyebrow">{eyebrow}</div>
          </div>
          {hasPageActions ? (
            <div className="page-actions">
              {shouldShowWorkflowTaskActions ? <WorkflowTaskActions /> : null}
              {actions}
            </div>
          ) : null}
        </div>
        <h1 className="page-title">{title}</h1>
        <div className="page-intro">{description}</div>
      </div>
      <div className="page-body">{children}</div>
    </div>
  );
}

export function SectionBlock({
  title,
  description,
  action,
  muted = false,
  children,
}: PropsWithChildren<{
  title: string;
  description?: string;
  action?: ReactNode;
  muted?: boolean;
}>) {
  return (
    <section className={`section-block${muted ? ' muted' : ''}`}>
      {(title || description || action) && (
        <div className="section-header">
          <div>
            {title ? <h2 className="section-title">{title}</h2> : null}
            {description ? <div className="section-copy">{description}</div> : null}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function SideIndex<T extends { id: string; label?: string; title?: string }>({
  items,
  activeId,
  onChange,
}: {
  items: T[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <aside className="side-index">
      <div className="side-index-shell">
        {items.map((item) => (
          <button
            key={item.id}
            className={`side-index-item${activeId === item.id ? ' active' : ''}`}
            onClick={() => onChange(item.id)}
            type="button"
          >
            <span>{item.label ?? item.title}</span>
            {activeId === item.id ? <ChevronRight size={15} /> : null}
          </button>
        ))}
      </div>
    </aside>
  );
}

export function DecisionRail({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; description: string; action?: ReactNode }>;
}) {
  return (
    <aside className="decision-rail">
      <div className="decision-rail-shell">
        <div className="kicker">{title}</div>
        <div className="stack">
          {items.map((item, index) => (
            <div key={`${item.label}-${index}`} className="rail-item">
              <div className="space-between">
                <strong>{item.label}</strong>
                {item.action}
              </div>
              <div className="tiny muted">{item.description}</div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

export function SourceToggleGroup({
  sources,
  selectedSources,
  onToggle,
}: {
  sources: string[];
  selectedSources: string[];
  onToggle: (source: string) => void;
}) {
  return (
    <div className="chip-row">
      {sources.map((source) => (
        <button
          key={source}
          className={`source-toggle${selectedSources.includes(source) ? ' active' : ''}`}
          onClick={() => onToggle(source)}
          type="button"
        >
          {selectedSources.includes(source) ? <Check size={14} /> : null}
          {source}
        </button>
      ))}
    </div>
  );
}

export function ResearchTable({
  columns,
  rows,
}: {
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, ReactNode>>;
}) {
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((column) => (
                <td key={column.key}>{row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProcessStepper({ items }: { items: Array<WorkflowStage | RunStep> }) {
  return (
    <div className="stepper-list">
      {items.map((item, index) => (
        <div key={item.id} className="stepper-item">
          <div className="stepper-index">{String(index + 1).padStart(2, '0')}</div>
          <div className="stepper-copy">
            <div className="space-between">
              <strong>{'label' in item ? item.label : item.title}</strong>
              <StatusBadge status={item.status} />
            </div>
            {'summary' in item ? <div className="tiny muted">{item.summary}</div> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TimelineFlow({
  items,
}: {
  items: Array<{ year: string; title: string; summary: string }>;
}) {
  return (
    <div className="timeline">
      {items.map((item) => (
        <div key={`${item.year}-${item.title}`} className="timeline-item">
          <div className="kicker">{item.year}</div>
          <div className="timeline-dot" />
          <div className="timeline-copy">
            <strong>{item.title}</strong>
            <div className="tiny muted">{item.summary}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RunLogStream({ logs }: { logs: RunLog[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="log-stream" ref={scrollRef}>
      {logs.map((log) => (
        <div key={log.id} className={`log-entry${log.level === 'info' ? '' : ` ${log.level}`}`}>
          <div className="space-between">
            <span className="tiny muted">{log.timestamp}</span>
            <span className="tiny muted">{log.level.toUpperCase()}</span>
          </div>
          <div className="tiny">{log.message}</div>
        </div>
      ))}
    </div>
  );
}

export function AnnotationPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <aside className="annotation-panel">
      <div className="annotation-panel-shell">
        <div className="kicker">{title}</div>
        <div className="stack">
          {items.map((item, index) => (
            <div key={`${item}-${index}`} className="annotation-pill">
              <ArrowRight size={14} />
              {item}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
