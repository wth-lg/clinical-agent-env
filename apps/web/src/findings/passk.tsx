// pass^k and the run's model on screen (plan P17j JU8): pass^3 and pass^5 of a task from
// summary.json's pass_k (packages/core/summary.ts passK), and the model and effort the run's
// records share.
import type { TaskSummary } from '../../../../packages/core/summary.ts';
import { modelLine } from '../data/model.ts';
import type { RunData } from '../data/results.ts';
import { GlossaryLink } from '../data/ui.tsx';

const shown = [3, 5] as const;
// A tiny chance reads "<0.1%", never "0.0%", which would say it cannot happen.
const percent = (v: number | null) => (v === null ? 'n/a' : v > 0 && v < 0.0005 ? '<0.1%' : `${(v * 100).toFixed(1)}%`);

// "pass^3 31.9%" and "pass^5 12.9%", one per line; n/a when the task has fewer valid trials than k.
export function PassK({ task, k }: { task: string; k: TaskSummary['pass_k'] }) {
  return (
    <span data-testid="pass-k" data-task={task} className="block text-xs text-ink-muted">
      {shown.map((n) => (
        <span key={n} data-k={n} data-value={k[n] === null ? '' : String(k[n])} title={`The chance that ${n} trials drawn from this task's valid trials all pass`} className="block">
          pass^{n} {percent(k[n])}
        </span>
      ))}
    </span>
  );
}

export const PassKLink = () => <GlossaryLink anchor="pass-k">What pass^k means</GlossaryLink>;

// "Model claude-opus-5-5, effort high"; when the records differ, or none records it, it says so.
export function ModelLine({ run }: { run: RunData }) {
  return <p data-testid="model-line" className="text-sm text-ink">{modelLine(run.summary!, run.trials)}</p>;
}
