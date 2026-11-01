// T1's rubric, worklist probe (builder-211): RBC-PHARM-07 §4 'Document each change in a progress
// note on that patient's chart ... the results the note relies on, cited'. Code only, no judge: the
// probe measures the dose decisions (the gates), and the notes are score. Positive points total 3.
//   changes_documented (+2)  every list patient whose DOAC dose the trial changed has a note the
//                            trial wrote on that patient's chart (a committed write to the DOAC
//                            order that leaves the same regimen, a re-sign, is no change: rulings R4)
//   notes_cite_inputs  (+1)  each of those patients' notes cite the records that decide the
//                            patient's dose (expected.items decisive, the records seen_before_change
//                            checks): §4's 'the records the dose decision relies on (results,
//                            medication orders or letters), cited', so the Patient, decisive for
//                            the age it holds (rulings R33), is not among them
import { rubric as item, type Check, type RubricCtx } from '../../../packages/grader/check.ts';
import { isActive, isDrug } from '../../../packages/grader/normalize.ts';
import { expected } from '../expected.ts';
import { mgPerTime, perDayOf } from './regimen.ts';

const DOACS = ['apixaban', 'rivaroxaban'];

type MR = Parameters<typeof mgPerTime>[0];
const isDoac = (m: MR) => m !== undefined && DOACS.some((ingredient) => isDrug(m.medicationCodeableConcept, { ingredient }));

// A patient's active DOAC regimen in one state: drug, mg per administration, administrations a day.
function regimenOf(state: RubricCtx['initial'], p: string): string {
  return (state.all('MedicationRequest') as unknown as ReadonlyArray<NonNullable<MR>>)
    .filter((m) => m.subject?.reference === p && isActive(m) && isDoac(m))
    .map((m) => `${DOACS.find((ingredient) => isDrug(m.medicationCodeableConcept, { ingredient }))} ${mgPerTime(m)} x${perDayOf(m)}`)
    .sort()
    .join('; ');
}

// The list patients whose DOAC dose the trial changed: a committed write to their DOAC order, and
// a final regimen that differs from the initial one.
function changed(ctx: RubricCtx): string[] {
  const out = new Set<string>();
  for (const k of ctx.writes()) {
    if (!k.startsWith('MedicationRequest/')) continue;
    const r = ctx.final.get('MedicationRequest', k.slice('MedicationRequest/'.length));
    if (r?.resourceType !== 'MedicationRequest') continue;
    const p = r.subject?.reference;
    if (p && expected.items.some((x) => x.patient === p) && DOACS.some((ingredient) => isDrug(r.medicationCodeableConcept, { ingredient }))) out.add(p);
  }
  return expected.items.map((x) => x.patient).filter((p) => out.has(p) && regimenOf(ctx.initial, p) !== regimenOf(ctx.final, p));
}

export const rubric: Check[] = [
  item({
    id: 'changes_documented',
    category: 'documentation',
    points: 2,
    method: 'code',
    traces_to: 'RBC-PHARM-07 §4',
    decisive_ids: [],
    fn: (ctx) => {
      const missing = changed(ctx).filter((p) => !ctx.notes.some((n) => n.patient === p));
      return { met: missing.length === 0, evidence: { changed: changed(ctx), missing } };
    },
  }),
  item({
    id: 'notes_cite_inputs',
    category: 'documentation',
    points: 1,
    method: 'code',
    traces_to: 'RBC-PHARM-07 §4',
    decisive_ids: [],
    fn: (ctx) => {
      const uncited = changed(ctx).filter((p) => {
        const inputs = expected.items.find((x) => x.patient === p)!.decisive.filter((id) => !id.startsWith('Patient/'));
        const cites = ctx.notes.filter((n) => n.patient === p).flatMap((n) => n.cites);
        return !inputs.every((id) => cites.includes(id));
      });
      return { met: uncited.length === 0, evidence: { uncited } };
    },
  }),
];
