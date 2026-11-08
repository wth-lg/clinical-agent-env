// The Grading tab: the outcome, four metric cards (Score, Cost, Tokens, Duration), each gate
// check with what it requires, what the trial left and its evidence ids (a link to the step that
// wrote, else first exposed, each one), and the rubric table with the points, met and judge
// quote of each item, all from the record's current grade (summary.ts currentGrade). A gate over a
// worklist also says how many items it found right and lists each failed item with why, its ids and
// its kind of failure (items.ts). An excluded trial was not graded; a check that threw is the
// grader's error, in the danger style.
import { Check, CircleAlert, CircleHelp, Minus, X, type LucideIcon } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import type { Step } from '../../../../packages/grader/check.ts';
import { NOT_RERUN_REASON, RERUN_OUTCOMES, type Outcome } from '../../../../packages/core/outcomes.ts';
import { currentGrade } from '../../../../packages/core/summary.ts';
import { durationSeconds, formatDuration } from '../data/duration.ts';
import { shownFault } from '../data/failures.ts';
import { checkTextOf, type Trial } from '../data/results.ts';
import { LINK, markOf, markProps, OutcomeChip, SECTION_LABEL } from '../data/ui.tsx';
import { failedItems, itemLabelsOf, itemsMetText, type ItemRow } from './items.ts';
import { useRubricQuestions } from './questions.ts';
import { metText, RUBRIC_NOTE, rubricGood, rubricMark, rubricMetText, rubricTotal, SCORE_TITLE, scoreNote, scoreText, totalText, type RubricMark } from './rubric.ts';
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

// A table that becomes one card per row below sm, on the same DOM, so the test ids and the reading
// order stay (ui-polish 3.1): the column heads are for screen readers only there, and a cell can
// show its column's name from data-label (CELL_LABEL).
export const CARD_TABLE = 'w-full text-left [overflow-wrap:anywhere] max-sm:block max-sm:[&_tbody]:block max-sm:[&_tfoot]:block max-sm:[&_thead]:sr-only max-sm:[&_tr]:grid max-sm:[&_tr]:gap-x-3 max-sm:[&_tr]:gap-y-1.5 max-sm:[&_tr]:py-2.5 max-sm:[&_td]:p-0';
export const CELL_LABEL = 'max-sm:before:mr-1.5 max-sm:before:text-xs max-sm:before:font-normal max-sm:before:text-ink-muted max-sm:before:content-[attr(data-label)]';

// A rubric row's name: the question its item asks. A long judge criterion (some run to several
// hundred characters) shows two lines with a toggle for the rest, so the rubric stays scannable,
// on a phone above all; the whole text is in the DOM either way. The toggle's name carries the item
// id, so no two toggles read alike (verifier-phase-P17i-UI-3-1 F2).
const LONG_QUESTION = 160;
function QuestionName({ text, id }: { text: string; id: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > LONG_QUESTION;
  return (
    <>
      <span data-testid="rubric-name" className={`break-words text-ink ${long && !open ? 'line-clamp-2' : 'block'}`}>{text}</span>
      {long && <button type="button" aria-expanded={open} aria-label={`${open ? 'Show less' : 'Show the full question'} for ${id}`} onClick={() => setOpen(!open)} className={`${LINK} rounded-sm text-xs text-ink-muted pointer-coarse:py-2`}>{open ? 'Show less' : 'Show the full question'}</button>}
    </>
  );
}

// The met column's mark: a check, a cross, a dash for a penalty that did not fire, an alert for one
// that fired, a question mark when the judge was unsure; a heavy ink mark when the row costs the
// trial points. Never red: red means the environment, the grader, an error or harm, not the model
// (P25u V2c, copy rule C8).
const MARK_ICON: Readonly<Record<RubricMark, LucideIcon>> = { met: Check, 'not-met': X, 'not-triggered': Minus, fired: CircleAlert, unsure: CircleHelp };
function MetCell({ c }: { c: CheckRow }) {
  const good = rubricGood(c);
  const mark = rubricMark(c);
  const Icon = MARK_ICON[mark];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Icon aria-hidden data-mark={mark} className={`h-3.5 w-3.5 shrink-0 ${good === false ? 'text-ink' : 'text-ink-muted'}`} strokeWidth={good === false ? 2.5 : 1.75} />
      <span className={good === false ? 'font-semibold text-ink' : ''}>{rubricMetText(c)}</span>
    </span>
  );
}

// A stat tile. mark: the outcome's mark before the value (the Gate checks tile, V9), so the tile
// that decides pass reads in the verdict's own style. gloss: a second small line under the note
// (rubric.ts RUBRIC_NOTE on the rubric tile, copy rule C2).
function Metric({ title, value, testId, note, mark, gloss, className = '' }: { title: string; value: string | null; testId: string; note?: string | undefined; mark?: { className: string; style?: CSSProperties } | undefined; gloss?: string | undefined; className?: string }) {
  return (
    <div className={`min-w-0 rounded-sm border border-line bg-surface px-3 py-2 ${className}`}>
      <p data-testid={testId} className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-xs text-ink-muted">{title}</span>
        {value !== null && <>{' '}<span className="inline-flex items-center gap-1.5 font-medium tabular-nums text-ink">{mark !== undefined && <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-[2px] ${mark.className}`} style={mark.style} />}{value}</span></>}
      </p>
      {(value === null || note !== undefined) && <p data-testid={`${testId}-note`} className="mt-0.5 text-xs text-ink-muted">{value === null ? '—' : note}</p>}
      {gloss !== undefined && <p data-testid={`${testId}-gloss`} className="mt-0.5 text-xs text-ink-muted">{gloss}</p>}
    </div>
  );
}

// A check text with an empty "()" dropped (P25u J24): a task's requires text names the studies a
// rule applies to in parentheses, and a rule that applies to none leaves "()"; the task file stays
// as it is, because an edit there moves grader_task_version.
export const tidyCheckText = (s: string): string => s.replace(/\s*\(\s*\)/g, '');

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
    <button type="button" data-testid={testId} data-id={id} data-step={n} onClick={() => onStep(n)} className="inline-flex min-h-6 min-w-0 items-baseline gap-1 rounded-md text-left text-xs text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink pointer-coarse:px-1 pointer-coarse:py-2">
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
  const seconds = durationSeconds(r);
  const g = currentGrade(r);
  const checks = (g.checks ?? []) as readonly CheckRow[];
  // Checks the trial did not meet first (review-ui-P16-1 F7); the sort is stable, so each group keeps the grader's order.
  const gates = checks.filter((c) => c.kind !== 'rubric').sort((a, b) => Number(a.met === true) - Number(b.met === true));
  const rubric = checks.filter((c) => c.kind === 'rubric');
  const graded = checks.length > 0;
  // A check threw: the grade did not finish, so the recorded checks decide nothing
  // (verifier-phase-P16-2 minor: it read "Graded with grader 8" and "8 of 9 met").
  const threwCheck = r.error && !g.regraded ? r.error.check : null;
  // Each failed item's kind of failure, from the current grade's attribution (a regrade's own when it
  // stored one; verifier-phase-P17i-S0-208-1 S1).
  const itemLabels = itemLabelsOf(r as Parameters<typeof itemLabelsOf>[0]);
  const unfinished = r.error != null && !g.regraded;
  const score = scoreText(g);
  const total = rubricTotal(rubric);
  const questions = useRubricQuestions(t.task, rubric.length > 0);
  const gatesMet = gates.filter((c) => c.met === true).length;
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <OutcomeChip outcome={g.outcome} fault={shownFault(t.explanation)} />
        {graded && <span data-testid="grade-line" className="text-ink-muted">{unfinished ? 'Not graded: a grader check failed with an error, so the trial has no grade.' : g.regraded ? 'Current grade, from the last regrade.' : r.grader_version ? `Graded with grader ${r.grader_version}.` : 'Graded.'}</span>}
      </p>
      {/* The gate result first, in the verdict's mark, because it decides pass; the rubric score
          last, since it never decides pass (P25u V9, copy rule C2). */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {gates.length > 0 && (
          <Metric
            title="Gate checks"
            value={unfinished ? 'not decided' : `${gatesMet} of ${gates.length} met`}
            testId="metric-gates"
            mark={unfinished ? undefined : markProps(markOf(g.outcome, shownFault(t.explanation)))}
            note={unfinished ? 'A grader check failed with an error, so the checks recorded before it decide nothing.' : gatesMet === gates.length ? 'Every gate check is met, so the trial passes.' : 'A trial passes only when every gate check is met.'}
            className="col-span-2 lg:col-span-4"
          />
        )}
        <Metric title="Cost" value={usd(r.cost_usd + (r.judge_cost_usd ?? 0))} testId="metric-cost" note={`agent ${usd(r.cost_usd)}, judge ${usd(r.judge_cost_usd ?? 0)}`} />
        <Metric title="Tokens" value={r.usage ? `${num(r.usage.input + r.usage.cache_read + r.usage.cache_write)} in, ${num(r.usage.output)} out` : null} testId="metric-tokens" note={r.usage ? `${num(r.usage.cache_read)} read from the cache` : undefined} />
        <Metric title="Duration" value={seconds === null ? null : formatDuration(seconds)} testId="metric-duration" note={r.turns !== undefined ? `${r.turns} turns` : undefined} />
        <Metric title={SCORE_TITLE} value={score} testId="score-card" note={score !== null ? scoreNote(checks) : undefined} gloss={score === null ? undefined : RUBRIC_NOTE} />
      </div>
      {r.error && (
        <div data-testid="grading-error" role="alert" className="rounded-sm border border-danger bg-surface p-3">
          <p className="font-medium text-danger">{r.error.check ? `The grader check ${r.error.check} failed with an error.` : 'The grader failed with an error.'}</p>
          <p className="mt-1 break-words font-mono text-xs text-ink-muted">{r.error.message}</p>
        </div>
      )}
      {!graded && (
        <p data-testid="grading-empty" className="rounded-sm border border-dashed border-line-strong p-4 text-ink-muted">
          {/* A stopped trial (CANCELLED) in the chip's words, not the record's "run again". */}
          {g.outcome === 'CANCELLED' ? 'Not graded. You stopped this trial before the model finished, so it is not counted; the grader did not check it.' : <>Not graded. The trial ended {g.outcome}, so it is excluded from the results{notGradedThen(g.outcome)}; the grader did not check it.</>}
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
                  {/* A check not met is heavy ink (an X, bold "not met", the found value on a
                      highlight), never red: red is the grader's own error here (V2c, C8). */}
                  <p className="flex flex-wrap items-center gap-x-2">
                    {c.met === true ? <Check aria-hidden className="h-3.5 w-3.5 text-ink-muted" strokeWidth={1.75} /> : <X data-testid="check-failed-icon" aria-hidden className={`h-3.5 w-3.5 ${threw ? 'text-danger' : 'text-ink'}`} strokeWidth={2.5} />}
                    <span data-testid="check-state" className={`text-xs ${threw ? 'font-semibold text-danger' : c.met !== true ? 'font-semibold text-ink' : 'text-ink-muted'}`}>{threw ? 'error' : metText(c.met)}</span>
                    <code className="break-all font-medium text-ink">{c.id}</code>
                    {c.id === decisive && <span className="rounded-sm border border-line-strong px-1 text-xs text-ink">decisive check</span>}
                  </p>
                  {requires !== undefined && <p className="break-words pl-5 text-ink-muted">Requires {tidyCheckText(requires)}.</p>}
                  {f !== null && <p data-testid="check-found" className="break-words pl-5 text-ink"><span className="rounded-sm bg-canvas px-1 dark:bg-line">Found {f}.</span></p>}
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
                            <span className="text-ink">: {i.why}</span>
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
        <Section title="Rubric" lead="Rubric items add points, and penalty items subtract them; they never decide a pass.">
          <table className={`${CARD_TABLE} sm:table-fixed sm:break-words`}>
            <thead className="text-xs text-ink-muted">
              <tr>
                {/* The widths keep the Item and quote columns at 160px or more on the shared page
                    column (P25u V8; verifier-phase-P17i-UI-3-1 F1). */}
                <th scope="col" className="pb-1 pr-3 font-normal sm:w-[33%]">Item</th>
                <th scope="col" className="whitespace-nowrap pb-1 pr-3 font-normal sm:w-[4.5rem]">Points</th>
                <th scope="col" className="whitespace-nowrap pb-1 pr-3 font-normal sm:w-[7rem]">Met</th>
                <th scope="col" className="pb-1 font-normal">Judge quote</th>
              </tr>
            </thead>
            <tbody>
              {rubric.map((c) => {
                const quote = typeof c.evidence?.quote === 'string' && c.evidence.quote !== '' ? c.evidence.quote : null;
                const question = questions[c.id];
                return (
                  <tr key={c.id} data-testid="rubric-row" data-id={c.id} data-points={String(c.points)} data-met={String(c.met)} className="border-t border-line align-top max-sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                    <td data-label="Item" className="py-1.5 pr-3">
                      {question !== undefined && <QuestionName text={question} id={c.id} />}
                      <span className="flex flex-wrap items-baseline gap-x-1.5 text-xs text-ink-muted">
                        <code className={`break-words ${question === undefined ? 'font-medium text-ink' : ''}`}>{c.id}</code>
                        <span>{[c.category, c.method].filter(Boolean).join(', ')}</span>
                      </span>
                    </td>
                    <td data-testid="rubric-points" data-label="Points" className={`whitespace-nowrap py-1.5 pr-3 tabular-nums ${CELL_LABEL}`}>{`${(c.points ?? 0) > 0 ? '+' : ''}${c.points}`}</td>
                    <td data-testid="rubric-met" data-label="Met" className="whitespace-nowrap py-1.5 pr-3"><MetCell c={c} /></td>
                    <td data-testid="rubric-quote" data-label="Judge quote" className={`whitespace-pre-line py-1.5 text-xs max-sm:col-span-3 ${quote === null ? 'text-ink-muted max-sm:hidden' : 'text-ink max-sm:border-l-2 max-sm:border-line max-sm:pl-2 max-sm:before:mb-0.5 max-sm:before:block max-sm:before:text-ink-muted max-sm:before:content-[attr(data-label)]'}`}>{quote ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr data-testid="rubric-total" data-earned={total.earned} data-possible={total.possible} className="border-t border-line-strong max-sm:grid-cols-[auto_minmax(0,1fr)]">
                <td data-label="Total" className="py-1.5 pr-3 font-medium">Total</td>
                <td data-label="Points" colSpan={3} className="py-1.5 tabular-nums">{totalText(total)}</td>
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
      <h3 className={SECTION_LABEL}>{title}</h3>
      {lead !== undefined && <p className="mt-0.5 text-xs text-ink-muted">{lead}</p>}
      <div className="mt-2 min-w-0">{children}</div>
    </section>
  );
}
