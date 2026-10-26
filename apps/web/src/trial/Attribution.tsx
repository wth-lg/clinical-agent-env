// The Attribution tab: why the trial got its label, in the explanation's own terms
// (packages/core/explain.ts explainTrial): the kind of failure, the confirmation state, the
// decisive step, the exposure of the failed check's decisive ids, the audit row, the criteria of
// other faults that hold (notes), and the criteria table: M1-M5, then every criterion of every
// fault in FAULT_PRECEDENCE order, each met or not with its evidence and a link to its definition,
// the one that decided the fault marked. This is how a model fault is told apart from an
// environment or grader fault for this trial.
import { CONFIRMATION_DEFINITIONS, CONFIRMATION_CRITERIA, FAULT_DEFINITIONS, FAULT_PRECEDENCE, RUN_BLOCKS, type Fault } from '../../../../packages/core/outcomes.ts';
import { MET_TEXT, TAXONOMY_TEXT, type AuditRow, type CriterionRow, type Explanation, type Holding } from '../../../../packages/core/explain.ts';
import type { Step } from '../../../../packages/grader/check.ts';
import type { Trial } from '../data/results.ts';
import { GlossaryLink, HashText } from '../data/ui.tsx';
import { EvidenceId, Section } from './Grading.tsx';

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

type Exposure = { id: string; first_exposed_step: number | null; first_shown_step?: number | null };

export function StepLink({ n, onStep, testId, children }: { n: number; onStep: (n: number) => void; testId?: string; children?: React.ReactNode }) {
  return <button type="button" data-testid={testId} data-step={n} onClick={() => onStep(n)} className={`${LINK} rounded-sm`}>{children ?? `step ${n}`}</button>;
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

export function Attribution({ t, e, steps, onStep }: { t: Trial; e: Explanation; steps: readonly Step[] | null; onStep: (n: number) => void }) {
  const auto = (t.record as { attribution?: { auto: string; exposure: Exposure[] } | null }).attribution ?? null;
  const audit: AuditRow | null = t.audit;
  const deciding = e.deciding?.id ?? null;
  // The kind of model failure and the exposure of the decisive ids speak only for a model fault
  // (review-ui-P16-1 F3).
  const modelFault = e.fault === 'model' || e.fault === 'refusal';
  return (
    <div className="space-y-5">
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
        <dd>{e.confirmation === null ? 'does not apply' : <><GlossaryLink anchor="confirmation" className={LINK}>{e.confirmation}</GlossaryLink>: <span className="text-ink-muted">{CONFIRMATION_DEFINITIONS[e.confirmation]}</span></>}</dd>
        <dt>Decisive step</dt>
        <dd>{e.decisive_step === null ? 'none' : <StepLink n={e.decisive_step} onStep={onStep}>Step {e.decisive_step}</StepLink>}</dd>
        <dt>Human audit</dt>
        <dd data-testid="audit-notes">
          {audit === null ? 'not human-audited' : (
            <>
              <span>label {e.audit_label ?? 'none'}{audit.taxonomy ? `, kind ${audit.taxonomy.replace(/_/g, ' ')}` : ''}; model fault: {audit.model_fault ?? 'not said'}; LLM auditor agrees: {yesNo(audit.llm_auditor_agrees)}</span>
              {audit.evidence_ids.length > 0 && <span className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1"><span className="text-xs text-ink-muted">Evidence:</span>{audit.evidence_ids.map((id) => <EvidenceId key={id} id={id} steps={steps} onStep={onStep} />)}</span>}
              {audit.note && <span className="mt-1 block text-ink-muted">{audit.note}</span>}
            </>
          )}
        </dd>
      </dl>

      {modelFault && auto && auto.exposure.length > 0 && (
        <Section title="Exposure of the decisive ids" lead="The step at which each record the failed check needs was first returned to the model.">
          <table className="w-full table-fixed text-left [overflow-wrap:anywhere]">
            <thead className="text-xs text-ink-muted"><tr><th scope="col" className="w-1/2 pb-1 font-normal">Record</th><th scope="col" className="pb-1 font-normal">First returned</th></tr></thead>
            <tbody>
              {auto.exposure.map((x) => (
                <tr key={x.id} data-testid="exposure-row" data-id={x.id} className="border-t border-line align-top">
                  <td className="py-1.5 pr-2"><code className="text-xs">{x.id}</code></td>
                  <td className="py-1.5">
                    {x.first_exposed_step === null ? <span className="text-ink-muted">never</span> : <StepLink n={x.first_exposed_step} onStep={onStep} />}
                    {x.first_shown_step !== undefined && <span className="block text-xs text-ink-muted">decisive text shown: {x.first_shown_step === null ? 'never' : `step ${x.first_shown_step}`}</span>}
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
        <div className="space-y-4">
          <CriteriaSummary e={e} />
          <div>
            <h4 className="text-xs font-medium text-ink">Confirmation (M1-M5) <GlossaryLink anchor="confirmation" className={`${LINK} font-normal text-ink-muted`}>definition</GlossaryLink></h4>
            <ul data-testid="detail-criteria" className="divide-y divide-line">
              {e.criteria.map((c) => <CriterionItem key={c.id} c={c} group="confirmation" deciding={false} />)}
            </ul>
          </div>
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
      </Section>
    </div>
  );
}
