import { CheckCircle2, LoaderCircle, RotateCcw, Square } from 'lucide-react';
import type { TransitionState } from '../../types/app';

function getIcon(state: TransitionState) {
  if (state === 'completed') {
    return CheckCircle2;
  }

  if (state === 'restarting') {
    return RotateCcw;
  }

  if (state === 'aborting') {
    return Square;
  }

  return LoaderCircle;
}

export default function TaskTransitionOverlay({
  state,
  label,
}: {
  state: TransitionState | null;
  label: string;
}) {
  if (!state || !label) {
    return null;
  }

  const Icon = getIcon(state);

  return (
    <div className={`task-transition-overlay ${state}`}>
      <div className="task-transition-card">
        <div className={`task-transition-icon${state === 'completed' ? '' : ' spinning'}`}>
          <Icon size={18} />
        </div>
        <div className="task-transition-copy">
          <div className="kicker">Workflow Update</div>
          <strong>{label}</strong>
        </div>
      </div>
    </div>
  );
}
