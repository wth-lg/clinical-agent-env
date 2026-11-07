// The Attribution tab: why the trial got its label, in the explanation's own terms
// (packages/core/explain.ts explainTrial): the kind of failure, the confirmation state, the
// decisive step, the exposure of the failed check's decisive ids, the audit row, the criteria of
// other faults that hold (notes), and the criteria table: M1-M5, then every criterion of every
// fault in FAULT_PRECEDENCE order, each met or not with its evidence and a link to its definition,
// the one that decided the fault marked. This is how a model fault is told apart from an
// environment or grader fault for this trial. It opens with the verdict (the fault and the
// criterion that decided it, with its evidence); the confirmation criteria M1-M5 are in view,
// each met or not met (trace rows W8, U30: the UI says why each failure happened under explicit
// criteria, with no click), and the fault criteria are one click away, under "Show the fault
// criteria checked (N)" (ui-polish 3.4).
import { CONFIRMATION_DEFINITIONS, CONFIRMATION_CRITERIA, FAULT_DEFINITIONS, FAULT_PRECEDENCE, RUN_BLOCKS, type Fault } from '../../../../packages/core/outcomes.ts';
import { fittingAttribution, MET_TEXT, TAXONOMY_TEXT, type AuditRow, type CriterionRow, type ExplainRecord, type Explanation, type Holding } from '../../../../packages/core/explain.ts';
import type { Step } from '../../../../packages/grader/check.ts';
import type { Trial } from '../data/results.ts';
import { shownFault } from '../data/failures.ts';
import { GlossaryLink, HashText } from '../data/ui.tsx';
import { CARD_TABLE, CELL_LABEL, EvidenceId, Section } from './Grading.tsx';
import { confirmationWords, isModelFault } from './headline.ts';
import type { WhereStep } from './where.ts';

const CRITERIA = [...Object.values(FAULT_DEFINITIONS).flatMap((d) => d.criteria), ...RUN_BLOCKS, ...CONFIRMATION_CRITERIA];
// A criterion's sentence from outcomes.ts.
export const criterionText = (id: string): string => CRITERIA.find((c) => c.id === id)?.text ?? id;
// The sentence inside a line ("decided by the trial stopped at ..."): lower-case first letter, no full stop.
export const criterionPhrase = (id: string): string => {
  const t = criterionText(id).replace(/\.$/, '');
  return t.charAt(0).toLowerCase() + t.slice(1);
};
// One word per fault, the word the label uses (review-ui-P16-1 F5).
export const FAULT_WORD: Readonly<Record<Fault, string>> = { model: 'model', refusal: 'model', env: 'environment', grader: 'grader', infra: 'infra' };
// Each fault as a noun inside a sentence: "the fault is the infrastructure's", "Ruled out: a
// refusal (R1 not met), the model (MF1-MF2 not met)", so no list names the model twice
// (verifier-phase-P16-2 minor).
export const FAULT_NOUN: Readonly<Record<Fault, string>> = { model: 'the model', refusal: 'a refusal', env: 'the environment', grader: 'the grader', infra: 'the infrastructure' };
export const LINK = 'text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink';

type Exposure = { id: string; first_exposed_step: number | null; first_shown_step?: number | null; first_seen_step?: number | null };

export function StepLink({ n, onStep, testId, children }: { n: number; onStep: (n: number) => void; testId?: string; children?: React.ReactNode }) {
  return <button type="button" data-testid={testId} data-step={n} onClick={() => onStep(n)} className={`${LINK} rounded-sm`}>{children ?? `step ${n}`}</button>;
}

// The steps that explain the failure (where.ts, P25u J4), each a link that scrolls the trajectory
// to it: the arrival, the first showing, the decisive step; a record never shown has no step. The
// header's Where and the Attribution tab show the same list.
export function WhereList({ where, onStep }: { where: readonly WhereStep[]; onStep: (n: number) => void }) {
  return (
    <ul data-testid="where-steps" className="space-y-0.5">
      {where.map((w, i) => (
        <li key={i} data-kind={w.kind} data-step={w.step ?? ''} className="break-words">
          {w.step === null ? <span className="text-ink-muted">Never</span> : <StepLink n={w.step} onStep={onStep} testId={w.kind === 'decisive' ? 'decisive-step-link' : 'where-step-link'}>{w.kind === 'decisive' ? `Decisive step ${w.step}` : `Step ${w.step}`}</StepLink>}
          <span className={w.step === null ? 'text-ink-muted' : ''}>: {w.text}</span>
        </li>
      ))}
    </ul>
  );
}

// Only the code links to its definition; the sentence is plain text (review-ui-P16-1 F4).
function CriterionItem({ c, group, deciding }: { c: CriterionRow; group: string; deciding: boolean }) {
  return (
    <li data-testid="criterion-row" data-fault={group} data-id={c.id} data-met={String(c.met)} data-evidence={c.evidence} data-deciding={String(deciding)} className={`break-words py-1.5 ${deciding ? 'border-l-2 border-l-accent pl-2' : ''}`}>
      <span className="font-medium text-ink"><GlossaryLink anchor={`criterion-${c.id}`} className={LINK}>{c.id}</GlossaryLink>: {MET_TEXT[String(c.met)]}</span>
      {c.evidence !== '' && <span className="text-ink-muted">: <HashText text={c.evidence} /></span>}
      {deciding && <span className="ml-2 rounded-sm border border-line-strong px-1 text-xs text-ink">decided the fault</span>}
      <span className="block text-xs text-ink-muted">{criterionText(c.id)}</span>
    </li>
  );
}

function Note({ n }: { n: Holding }) {
  return <li className="break-words"><GlossaryLink anchor={`criterion-${n.id}`} className={LINK}>{n.id}</GlossaryLink>: {criterionPhrase(n.id)}. <span className="text-ink-muted"><HashText text={n.evidence} /></span></li>;
}

const range = (rows: readonly CriterionRow[]) => (rows.length === 1 ? rows[0]!.id : `${rows[0]!.id}-${rows.at(-1)!.id}`);

// One line before the table: the criterion that decided, then each other fault, ruled out (none
// of its criteria met) or also holding (review-ui-P16-1 F4).
function CriteriaSummary({ e }: { e: Explanation }) {
  const others = FAULT_PRECEDENCE.filter((f) => f !== e.fault && !(e.fault === 'refusal' && f === 'model') && !(e.fault === 'model' && f === 'refusal'));
  const out = others.filter((f) => e.fault_criteria[f].every((c) => c.met !== true));
  const holds = others.filter((f) => !out.includes(f));
  return (
    <p data-testid="criteria-summary" className="break-words text-ink">
      {e.deciding ? <>Decided by <GlossaryLink anchor={`criterion-${e.deciding.id}`} className={LINK}>{e.deciding.id}</GlossaryLink>: {criterionPhrase(e.deciding.id)}.</> : 'No fault: the trial passed.'}
      {out.length > 0 && <> Ruled out: {out.map((f) => `${FAULT_NOUN[f]} (${range(e.fault_criteria[f])} not met)`).join(', ')}.</>}
      {holds.length > 0 && <> Also holds: {holds.map((f) => `${FAULT_NOUN[f]} (${e.fault_criteria[f].filter((c) => c.met === true).map((c) => c.id).join(', ')})`).join(', ')}.</>}
    </p>
  );
}

const yesNo = (v: boolean | null) => (v === null ? 'not asked' : v ? 'yes' : 'no');

// The verdict, first: "Fault: environment, decided by E8" and the evidence of that criterion (the
// criterion's sentence is in the Criteria summary below). When
// the audit relabelled the trial, the fault shown is the audit's, and the line names the fault the
// criteria found.
function Verdict({ e }: { e: Explanation }) {
  const shown = shownFault(e);
  const code = e.deciding && <GlossaryLink anchor={`criterion-${e.deciding.id}`} className={LINK}>{e.deciding.id}</GlossaryLink>;
  return (
    <div data-testid="attribution-verdict" className={`rounded-md border bg-canvas/60 px-3 py-2.5 dark:bg-canvas/40 ${shown === 'env' || shown === 'grader' ? 'border-danger' : 'border-line'}`}>
      {shown === null || e.deciding === null ? (
        <p className="font-medium text-ink">No fault: the trial passed.</p>
      ) : (
        <>
          <p className="font-medium text-ink">
            Fault: {FAULT_WORD[shown]}{shown === e.fault ? <>, decided by {code}</> : <> (the audit's label); the criteria found {FAULT_NOUN[e.fault!]} at fault, decided by {code}</>}
          </p>
          {e.deciding.evidence !== '' && <p className="mt-0.5 break-words text-ink-muted"><HashText text={e.deciding.evidence} /></p>}
        </>
      )}
    </div>
  );
}

// where: the steps that explain the failure (where.ts); headline: the header's plain line, the
// plain first sentence above the audit's note (P25u J17: the audit row has no summary field, so the
// page's own plain account leads and the auditor's shorthand sits behind a disclosure).
export function Attribution({ t, e, steps, where = [], headline = null, onStep }: { t: Trial; e: Explanation; steps: readonly Step[] | null; where?: readonly WhereStep[]; headline?: string | null; onStep: (n: number) => void }) {
  // The current grade's automatic kind and exposure (a regrade's own when it stored one; S0-208 S1),
  // only when it names the current decisive check, as explainTrial reads it: an older regrade entry
  // falls back to the recorded attribution, which may speak for an earlier grade.
  const auto = fittingAttribution(t.record as ExplainRecord) as { auto: string; exposure: Exposure[] } | null;
  const audit: AuditRow | null = t.audit;
  const deciding = e.deciding?.id ?? null;
  // The kind of model failure and the exposure of the decisive ids speak only for a model fault
  // (review-ui-P16-1 F3).
  const modelFault = e.fault === 'model' || e.fault === 'refusal';
  return (
    <div className="space-y-5">
      <Verdict e={e} />
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-[max-content_minmax(0,1fr)] [&_dd]:min-w-0 [&_dd]:break-words [&_dt]:text-ink-muted">
        <dt>Kind of failure</dt>
        <dd data-testid="taxonomy">
          {!modelFault ? (e.fault === null ? 'none: the trial passed' : `does not apply: the fault is ${FAULT_NOUN[e.fault]}'s, not the model's`) : (
            <>
              {e.taxonomy ? <><GlossaryLink anchor="taxonomy" className={LINK}>{e.taxonomy.replace(/_/g, ' ')}</GlossaryLink>: <span className="text-ink-muted">{TAXONOMY_TEXT[e.taxonomy]}</span></> : 'none'}
              {auto && auto.auto !== e.taxonomy && <span className="block text-xs text-ink-muted">The grader's automatic kind: {auto.auto.replace(/_/g, ' ')}.</span>}
            </>
          )}
        </dd>
        <dt>Confirmation</dt>
        <dd data-testid="confirmation">
          {e.confirmation === null ? 'does not apply' : isModelFault(e) ? (
            <>
              {/* Copy rule C5's phrase (J8b) on a model fault, then the state's definition. */}
              <GlossaryLink anchor="confirmation" className={LINK}>{e.confirmation}</GlossaryLink>: {confirmationWords(e.criteria)}.
              <span className="block text-xs text-ink-muted">{CONFIRMATION_DEFINITIONS[e.confirmation]}</span>
            </>
          ) : (
            // M1-M5 confirm a model fault; another fault's label is confirmed by its own definition (gate F4).
            <><GlossaryLink anchor="confirmation" className={LINK}>{e.confirmation} (M1–M5)</GlossaryLink>: <span className="text-ink-muted">{CONFIRMATION_DEFINITIONS[e.confirmation]}</span></>
          )}
        </dd>
        <dt>Where</dt>
        <dd>{where.length === 0 ? 'no step recorded' : <WhereList where={where} onStep={onStep} />}</dd>
        <dt>Human audit</dt>
        <dd data-testid="audit-notes">
          {audit === null ? 'not human-audited' : (
            <>
              {/* The plain account first (J17); the auditor's own note, in the audit's shorthand,
                  behind a disclosure. */}
              {headline !== null && <span data-testid="audit-plain" className="block text-ink">A person reviewed this trial and {audit.model_fault === 'yes' ? 'agrees it is the model\'s fault' : audit.model_fault === 'no' ? 'says it is not the model\'s fault' : 'did not decide whose fault it is'}: {headline.charAt(0).toLowerCase()}{headline.slice(1)}</span>}
              <span className="mt-1 block text-xs text-ink-muted">label {e.audit_label ?? 'none'}{audit.taxonomy ? `, kind ${audit.taxonomy.replace(/_/g, ' ')}` : ''}; model fault: {audit.model_fault ?? 'not said'}; LLM auditor agrees: {yesNo(audit.llm_auditor_agrees)}</span>
              {audit.evidence_ids.length > 0 && <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="text-xs text-ink-muted">Evidence:</span>{audit.evidence_ids.map((id) => <EvidenceId key={id} id={id} steps={steps} onStep={onStep} />)}</span>}
              {audit.note && (
                <details data-testid="audit-note" className="mt-1">
                  <summary className="cursor-pointer text-ink-muted pointer-coarse:py-3.5">Read the auditor's note</summary>
                  <span className="mt-1 block text-ink-muted">{audit.note}</span>
                </details>
              )}
            </>
          )}
        </dd>
      </dl>

      {modelFault && auto && auto.exposure.length > 0 && (
        <Section title="Exposure of the decisive ids" lead="The step at which each record the failed check needs was first returned to the model.">
          <table className={CARD_TABLE}>
            <thead className="text-xs text-ink-muted"><tr><th scope="col" className="pb-1 pr-3 font-normal sm:w-1/2">Record</th><th scope="col" className="pb-1 font-normal">First returned</th></tr></thead>
            <tbody>
              {auto.exposure.map((x) => (
                <tr key={x.id} data-testid="exposure-row" data-id={x.id} className="border-t border-line align-top max-sm:grid-cols-1">
                  <td data-label="Record" className="py-1.5 pr-3"><code className="text-xs">{x.id}</code></td>
                  <td data-label="First returned" className={`py-1.5 ${CELL_LABEL}`}>
                    {x.first_exposed_step === null ? <span className="text-ink-muted">never</span> : <StepLink n={x.first_exposed_step} onStep={onStep} />}
                    {x.first_shown_step !== undefined && <span className="block text-xs text-ink-muted">decisive text shown: {x.first_shown_step === null ? 'never' : `step ${x.first_shown_step}`}</span>}
                    {x.first_seen_step !== undefined && <span className="block text-xs text-ink-muted">seen by the check's rule: {x.first_seen_step === null ? 'never' : `step ${x.first_seen_step}`}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {e.notes.length > 0 && (
        <Section title="Also holds" lead="Criteria of other faults that hold but did not decide the fault, and run-level blocks.">
          <ul data-testid="detail-notes" className="space-y-0.5">{e.notes.map((n) => <Note key={n.id} n={n} />)}</ul>
        </Section>
      )}

      <Section title="Criteria" lead={<>Each criterion is checked against this trial. The fault is the first fault, in the order of the <GlossaryLink className={LINK}>definitions</GlossaryLink>, with a criterion that holds.</>} testId="criteria-table">
        <div className="space-y-3">
          <CriteriaSummary e={e} />
          <div data-testid="confirmation-criteria">
            {/* M1-M5 confirm a model fault; for another fault they are the criteria checked (gate N3). */}
            <h4 className="text-xs font-medium text-ink">{isModelFault(e) ? 'Confirmed by the record (M1–M4) and the human audit (M5)' : 'Attribution criteria (M1–M5)'} <GlossaryLink anchor="confirmation" className={`${LINK} font-normal text-ink-muted`}>definition</GlossaryLink></h4>
            <ul data-testid="detail-criteria" className="divide-y divide-line">
              {e.criteria.map((c) => <CriterionItem key={c.id} c={c} group="confirmation" deciding={false} />)}
            </ul>
          </div>
          <details data-testid="all-criteria">
            <summary className="cursor-pointer text-ink">{`Show the fault criteria checked (${FAULT_PRECEDENCE.reduce((n, f) => n + e.fault_criteria[f].length, 0)})`}</summary>
            <div className="mt-3 space-y-4">
              {/* The deciding fault's group and any group with a criterion that holds are open; the
                  faults ruled out are closed, one line each. */}
              {FAULT_PRECEDENCE.map((f) => {
                const met = e.fault_criteria[f].filter((c) => c.met === true).length;
                return (
                  <details key={f} data-testid="fault-criteria" data-fault={f} open={f === e.fault || met > 0} className="group">
                    <summary className="cursor-pointer text-xs font-medium text-ink">
                      Fault: {FAULT_WORD[f]}{f === 'refusal' ? ' (refusal)' : ''} <span className="font-normal text-ink-muted">{met === 0 ? `ruled out, ${range(e.fault_criteria[f])} not met` : `${met} of ${e.fault_criteria[f].length} met`}</span>
                    </summary>
                    <p className="mt-1 text-xs text-ink-muted">{FAULT_DEFINITIONS[f].sentence} <GlossaryLink anchor={`fault-${f}`} className={LINK}>Definition</GlossaryLink></p>
                    <ul className="divide-y divide-line">
                      {e.fault_criteria[f].map((c) => <CriterionItem key={c.id} c={c} group={f} deciding={c.id === deciding} />)}
                    </ul>
                  </details>
                );
              })}
            </div>
          </details>
        </div>
      </Section>
    </div>
  );
}
