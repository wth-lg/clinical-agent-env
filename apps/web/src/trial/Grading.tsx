// The Grading tab: the outcome, four metric cards (Score, Cost, Tokens, Duration), each gate
// check with what it requires, what the trial left and its evidence ids (a link to the step that
// wrote, else first exposed, each one), and the rubric table with the points, met and judge
// quote of each item, all from the record's current grade (summary.ts currentGrade). A gate over a
// worklist also says how many items it found right and lists each failed item with why, its ids and
// its kind of failure (items.ts). An excluded trial was not graded; a check that threw is the
// grader's error, in the danger style.
import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Step } from '../../../../packages/grader/check.ts';
import { NOT_RERUN_REASON, RERUN_OUTCOMES, type Outcome } from '../../../../packages/core/outcomes.ts';
import { currentGrade } from '../../../../packages/core/summary.ts';
import { shownFault } from '../data/failures.ts';
import { checkTextOf, type Trial } from '../data/results.ts';
import { OutcomeChip } from '../data/ui.tsx';
import { failedItems, itemsMetText, type ItemLabel, type ItemRow } from './items.ts';
import { metText, rubricMetText, rubricTotal, scoreNote, totalText } from './rubric.ts';
import { stepOfId } from './steps.ts';

export interface CheckRow {
  id: string;
  kind?: string;
  method?: string;
  category?: string;
  points?: number | null;
  met: unknown;
  evidence?: Record<string, unknown>;
  ids?: readonly string[];
  items?: readonly ItemRow[];
}

type Usage = { input: number; cache_write: number; cache_read: number; output: number };
const num = (n: number) => n.toLocaleString('en-US');
const usd = (n: number) => `$${n.toFixed(2)}`;
const SCORE_TITLE = 'Rubric score (does not decide pass)';

function duration(started: string | undefined, ended: string | undefined): string | null {
  if (!started || !ended) return null;
  const s = Math.round((Date.parse(ended) - Date.parse(started)) / 1000);
  if (!Number.isFinite(s) || s < 0) return null;
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

function Metric({ title, value, testId, note }: { title: string; value: string | null; testId: string; note?: string | undefined }) {
  return (
    <div className="min-w-0 rounded-sm border border-line bg-surface px-3 py-2">
      <p data-testid={testId} className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-xs text-ink-muted">{title}</span>
        {value !== null && <>{' '}<span className="font-medium tabular-nums text-ink">{value}</span></>}
      </p>
      {(value === null || note !== undefined) && <p data-testid={`${testId}-note`} className="mt-0.5 text-xs text-ink-muted">{value === null ? '—' : note}</p>}
    </div>
  );
}

// What happens to a trial the grader did not check: run again only when RERUN_OUTCOMES says so,
// else not run again, with NOT_RERUN_REASON's reason (plan-amendment-worklist W0-A).
const notGradedThen = (outcome: string): string => {
  if ((RERUN_OUTCOMES as readonly string[]).includes(outcome)) return ' and run again';
  const reason = NOT_RERUN_REASON[outcome as Outcome];
  return reason === undefined ? '' : ` and not run again: ${reason}`;
};

// An evidence id: a link to its step when a step wrote or exposed it.
export function EvidenceId({ id, steps, onStep, testId = 'evidence-id' }: { id: string; steps: readonly Step[] | null; onStep: (n: number) => void; testId?: string }) {
  const n = steps === null ? null : stepOfId(steps, id);
  if (n === null) return <code data-testid={testId} data-id={id} className="break-all rounded-sm bg-canvas px-1 text-xs text-ink" title={steps === null ? 'The trajectory is not loaded.' : 'No step wrote or read this resource.'}>{id}</code>;
  return (
    <button type="button" data-testid={testId} data-id={id} data-step={n} onClick={() => onStep(n)} className="inline-flex min-w-0 items-baseline gap-1 rounded-sm text-left text-xs text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink">
      <code className="break-all">{id}</code>
      <span className="shrink-0 text-ink-muted">step {n}</span>
    </button>
  );
}

function found(task: string, c: CheckRow): string | null {
  const text = checkTextOf(task)?.[c.id];
  if (text === undefined || c.met === true) return null;
  try {
    return text.found(c.evidence ?? {}) || null;
  } catch {
    return null;
  }
}

// decisive: the decisive check's id (explainTrial), marked in the list.
export function Grading({ t, steps, onStep, decisive = null }: { t: Trial; steps: readonly Step[] | null; onStep: (n: number) => void; decisive?: string | null }) {
  const r = t.record as Trial['record'] & { usage?: Usage; error?: { check: string | null; message: string } | null };
  const g = currentGrade(r);
  const checks = (g.checks ?? []) as readonly CheckRow[];
  // Checks the trial did not meet first (review-ui-P16-1 F7); the sort is stable, so each group keeps the grader's order.
  const gates = checks.filter((c) => c.kind !== 'rubric').sort((a, b) => Number(a.met === true) - Number(b.met === true));
  const rubric = checks.filter((c) => c.kind === 'rubric');
  const graded = checks.length > 0;
  // A check threw: the grade did not finish, so the recorded checks decide nothing
  // (verifier-phase-P16-2 minor: it read "Graded with grader 8" and "8 of 9 met").
  const threwCheck = r.error && !g.regraded ? r.error.check : null;
  // Each failed item's kind of failure, from the record's attribution; a regrade's grade carries none.
  const itemLabels = g.regraded ? null : ((r as { attribution?: { items?: ItemLabel[] } | null }).attribution?.items ?? null);
  const unfinished = r.error != null && !g.regraded;
  const score = graded && typeof g.score === 'number' ? g.score.toFixed(2) : null;
  const total = rubricTotal(rubric);
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <OutcomeChip outcome={g.outcome} fault={shownFault(t.explanation)} />
        {graded && <span data-testid="grade-line" className="text-ink-muted">{unfinished ? 'Not graded: a grader check failed with an error, so the trial has no grade.' : g.regraded ? 'Current grade, from the last regrade.' : r.grader_version ? `Graded with grader ${r.grader_version}.` : 'Graded.'}</span>}
      </p>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric title={SCORE_TITLE} value={score} testId="score-card" note={score !== null ? scoreNote(checks) : undefined} />
        <Metric title="Cost" value={usd(r.cost_usd + (r.judge_cost_usd ?? 0))} testId="metric-cost" note={`agent ${usd(r.cost_usd)}, judge ${usd(r.judge_cost_usd ?? 0)}`} />
        <Metric title="Tokens" value={r.usage ? `${num(r.usage.input + r.usage.cache_read + r.usage.cache_write)} in, ${num(r.usage.output)} out` : null} testId="metric-tokens" note={r.usage ? `${num(r.usage.cache_read)} read from the cache` : undefined} />
        <Metric title="Duration" value={duration(r.started, r.ended)} testId="metric-duration" note={r.turns !== undefined ? `${r.turns} turns` : undefined} />
      </div>
      {r.error && (
        <div data-testid="grading-error" role="alert" className="rounded-sm border border-danger bg-surface p-3">
          <p className="font-medium text-danger">{r.error.check ? `The grader check ${r.error.check} failed with an error.` : 'The grader failed with an error.'}</p>
          <p className="mt-1 break-words font-mono text-xs text-ink-muted">{r.error.message}</p>
        </div>
      )}
      {!graded && (
        <p data-testid="grading-empty" className="rounded-sm border border-dashed border-line-strong p-4 text-ink-muted">
          Not graded. The trial ended {g.outcome}, so it is excluded from the results{notGradedThen(g.outcome)}; the grader did not check it.
        </p>
      )}
      {gates.length > 0 && (
        <Section
          title={unfinished ? 'Gate checks, as recorded before the error' : `Gate checks (${gates.filter((c) => c.met === true).length} of ${gates.length} met)`}
          lead={unfinished ? 'The grade did not finish, so these checks do not decide the outcome.' : 'A trial passes only when every gate check is met.'}
        >
          <ul className="divide-y divide-line">
            {gates.map((c) => {
              const requires = checkTextOf(t.task)?.[c.id]?.requires;
              // The check that threw has no verdict on the trial: the grader's error, not "not met".
              const threw = threwCheck === c.id;
              const f = threw ? null : found(t.task, c);
              return (
                <li key={c.id} data-testid="gate-check" data-id={c.id} data-met={String(c.met)} data-error={String(threw)} data-decisive={String(c.id === decisive)} className="space-y-1 py-2">
                  <p className="flex flex-wrap items-center gap-x-2">
                    {c.met === true ? <Check aria-hidden className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.75} /> : <X data-testid="check-failed-icon" aria-hidden className="h-3.5 w-3.5 text-danger" strokeWidth={2.25} />}
                    <span data-testid="check-state" className={`text-xs ${threw || c.met !== true ? 'font-semibold text-danger' : 'text-ink-muted'}`}>{threw ? 'error' : metText(c.met)}</span>
                    <code className="break-all font-medium text-ink">{c.id}</code>
                    {c.id === decisive && <span className="rounded-sm border border-line-strong px-1 text-xs text-ink">decisive check</span>}
                  </p>
                  {requires !== undefined && <p className="break-words pl-5 text-ink-muted">Requires {requires}.</p>}
                  {f !== null && <p data-testid="check-found" className="break-words pl-5 text-danger">Found {f}.</p>}
                  {(c.ids ?? []).length > 0 && (
                    <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 pl-5">
                      <span className="text-xs text-ink-muted">Evidence:</span>
                      {c.ids!.map((id) => <EvidenceId key={id} id={id} steps={steps} onStep={onStep} />)}
                    </p>
                  )}
                  {c.items !== undefined && c.items.length > 0 && (
                    <div data-testid="gate-items" className="pl-5">
                      <p className="text-xs text-ink-muted">{itemsMetText(c.items)}</p>
                      <ul className="mt-0.5 space-y-0.5">
                        {failedItems(c.id, c.items, itemLabels).map((i) => (
                          <li key={i.item} data-testid="gate-item" data-item={i.item} data-label={i.label ?? ''} className="break-words">
                            <code className="text-xs text-ink">{i.name}</code>
                            <span className="text-danger">: {i.why}</span>
                            {i.label !== null && <span className="ml-2 rounded-sm border border-line-strong px-1 text-xs text-ink">{i.label.replace(/_/g, ' ')}</span>}
                            {i.ids.length > 0 && (
                              <span className="ml-2 inline-flex flex-wrap items-baseline gap-x-2">
                                {i.ids.map((id) => <EvidenceId key={id} id={id} steps={steps} onStep={onStep} testId="item-evidence-id" />)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}
      {rubric.length > 0 && (
        <Section title="Rubric" lead="Rubric items add to the score; they never decide a pass.">
          <table className="w-full table-fixed text-left [overflow-wrap:anywhere]">
            <thead className="text-xs text-ink-muted">
              <tr>
                <th scope="col" className="w-[36%] pb-1 font-normal">Item</th>
                <th scope="col" className="w-[13%] pb-1 font-normal">Points</th>
                <th scope="col" className="w-[15%] pb-1 font-normal">Met</th>
                <th scope="col" className="pb-1 font-normal">Judge quote</th>
              </tr>
            </thead>
            <tbody>
              {rubric.map((c) => {
                const quote = typeof c.evidence?.quote === 'string' && c.evidence.quote !== '' ? c.evidence.quote : null;
                return (
                  <tr key={c.id} data-testid="rubric-row" data-id={c.id} data-points={String(c.points)} data-met={String(c.met)} className="border-t border-line align-top">
                    <td className="py-1.5 pr-2"><code className="text-xs text-ink">{c.id}</code><span className="block text-xs text-ink-muted">{[c.category, c.method].filter(Boolean).join(', ')}</span></td>
                    <td data-testid="rubric-points" className="py-1.5 pr-2 tabular-nums">{`${(c.points ?? 0) > 0 ? '+' : ''}${c.points}`}</td>
                    <td data-testid="rubric-met" className="py-1.5 pr-2">{rubricMetText(c)}</td>
                    <td data-testid="rubric-quote" className={`whitespace-pre-line py-1.5 text-xs ${quote === null ? 'text-ink-muted' : 'text-ink'}`}>{quote ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr data-testid="rubric-total" data-earned={total.earned} data-possible={total.possible} className="border-t border-line-strong">
                <td className="py-1.5 pr-2 font-medium">Total</td>
                <td colSpan={3} className="py-1.5 tabular-nums">{totalText(total)}</td>
              </tr>
            </tfoot>
          </table>
        </Section>
      )}
    </div>
  );
}

export function Section({ title, lead, children, testId }: { title: ReactNode; lead?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className="min-w-0">
      <h3 className="font-medium text-ink">{title}</h3>
      {lead !== undefined && <p className="mt-0.5 text-xs text-ink-muted">{lead}</p>}
      <div className="mt-2 min-w-0">{children}</div>
    </section>
  );
}
