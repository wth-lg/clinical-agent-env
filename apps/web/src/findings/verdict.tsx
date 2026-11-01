// The result card on screen (plan-amendment-w4 PW4-F, F-2): the verdict in words beside each Wilson
// interval, the difficulty history over the committed runs, and a "No failures in N trials" card that
// links each such task to its strictness evidence (the grader checks on Tasks: the reference solution
// passes and every validation probe fails or passes as declared). The verdict is
// packages/core/summary.ts bandVerdict, the one definition the CLI's result card and summary.json's
// band_verdict use too, so the three never disagree; the glossary shows its rule (BAND_VERDICT_RULE).
// The verdict is text, never a colour alone.
import { bandVerdict } from '../../../../packages/core/summary.ts';
import { noPassCount, runBlock } from '../data/failures.ts';
import { pilotRates, type RunData } from '../data/results.ts';
import { Card, GlossaryLink, LINK } from '../data/ui.tsx';
import { hrefWith, onNav } from '../data/url.ts';

// "In band", "Above band", "Saturated" or "Below band"; nothing with no valid trials.
export function Verdict({ task, passes, trials, className = '' }: { task: string; passes: number; trials: number; className?: string }) {
  const v = bandVerdict(passes, trials);
  if (v === null) return null;
  return <span data-testid="band-verdict" data-task={task} data-verdict={v} title={`${passes}/${trials} against the target band`} className={`whitespace-nowrap text-xs font-medium text-ink ${className}`}>{v}</span>;
}

export const VerdictLink = () => <GlossaryLink anchor="band-verdict">What the verdicts mean</GlossaryLink>;

// k/n per task of a run: the official run's summary.json, a pilot's records (pilotRates); null for a
// pilot a trial blocks (it has no pass count).
function ratesOf(run: RunData): Record<string, { passes: number; trials: number }> | null {
  if (run.summary !== null) return runBlock(run.trials) !== null ? null : Object.fromEntries(Object.entries(run.summary.tasks).map(([id, t]) => [id, { passes: t.passes, trials: t.trials }]));
  if (noPassCount(run.trials) !== null) return null;
  return Object.fromEntries(pilotRates(run).map((r) => [r.task, { passes: r.passes, trials: r.valid }]));
}

// One row per task, one column per run, oldest first (the pilots by number, then the official run):
// k/n and the verdict in each cell.
export function DifficultyHistory({ runs }: { runs: readonly RunData[] }) {
  const cols = runs.map((run) => ({ run, rates: ratesOf(run) }));
  const tasks = [...new Set(cols.flatMap((c) => Object.keys(c.rates ?? {})))].sort();
  if (runs.length === 0 || tasks.length === 0) return null;
  return (
    <Card title="Difficulty history" testId="difficulty-history">
      <p className="text-xs text-ink-muted">Each task's pass count and verdict in every committed run, oldest first. Pilots are not counted in the results; they show how hard each task was before the final run.</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-ink-muted">
            <tr>
              <th scope="col" className="py-1 pr-3 font-medium">Task</th>
              {cols.map((c) => <th key={c.run.runId} scope="col" className="py-1 pr-3 font-medium" data-testid="history-run">{c.run.runId}{c.run.official ? ' (final)' : ''}</th>)}
            </tr>
          </thead>
          <tbody>
            {tasks.map((id) => (
              <tr key={id} data-testid="history-row" data-task={id} className="border-t border-line">
                <th scope="row" className="break-words py-1.5 pr-3 font-medium">{id}</th>
                {cols.map((c) => {
                  const r = c.rates?.[id];
                  return (
                    <td key={c.run.runId} data-testid="history-cell" data-run={c.run.runId} className="py-1.5 pr-3 align-top">
                      {c.rates === null ? <span className="text-xs text-ink-muted">blocked</span>
                        : r === undefined || r.trials === 0 ? <span className="text-xs text-ink-muted">none</span>
                          : <><span className="whitespace-nowrap">{r.passes}/{r.trials}</span> <Verdict task={id} passes={r.passes} trials={r.trials} className="block" /></>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-muted"><VerdictLink /></p>
    </Card>
  );
}

const toChecks = (task: string) => ({ view: 'tasks', task, tab: 'grader-validation' });

// The tasks of a run with valid trials and no failure: each says so, with the link to the grader
// checks that show the grader would have failed a wrong answer.
export function NoFailures({ run }: { run: RunData }) {
  const clean = Object.entries(run.summary?.tasks ?? {}).filter(([, t]) => t.trials > 0 && t.passes === t.trials);
  if (clean.length === 0) return null;
  return (
    <Card title="Tasks with no failures" testId="no-failures">
      <p className="text-xs text-ink-muted">A task every trial passes says little on its own: the grader might let wrong answers through. The grader checks show it does not. On each task, the reference solution passes and every validation probe gets the verdict it declares, so each wrong-answer probe fails.</p>
      <ul className="mt-2 space-y-1.5">
        {clean.map(([id, t]) => (
          <li key={id} data-testid="no-failures-row" data-task={id} className="break-words">
            <span className="font-medium">{id}</span>: <span data-testid="no-failures-text">No failures in {t.trials} trials.</span>{' '}
            <a href={hrefWith(toChecks(id))} onClick={onNav(toChecks(id))} className={LINK}>See the strictness evidence</a>
          </li>
        ))}
      </ul>
    </Card>
  );
}

