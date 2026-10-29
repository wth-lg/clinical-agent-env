// T1's rubric (design section 4, "T1" rubric table): what the note must state, cite and avoid.
// Every item reads the notes the trial wrote on the patient. The hybrid items take a value only
// when the text gives it in the plain form the pattern names (the keyword, no other number in
// between, then the unit); anything else goes to the extractor. note_uses_wrong_scr is the other
// way round: its pattern flags any mention of a wrong value, and the judge confirms it. Positive
// points total 13.
import type { Resource } from '../../../packages/env/store.ts';
import { hybrid, judged, rubric as item, type Check, type RubricCtx, type StateView } from '../../../packages/grader/check.ts';
import { isActive, isDrug } from '../../../packages/grader/normalize.ts';
import { expected } from '../expected.ts';
import { perDayOf } from './regimen.ts';

const PT = expected.patient;
const noteText = (ctx: RubricCtx) => ctx.notes.filter((n) => n.patient === PT).map((n) => n.text).join('\n\n');
const A = expected.apixaban.criteria;
const metText = (m: boolean) => (m ? 'met' : 'not met');
// The stale and entered-in-error SCr values of the design's wrong paths, and any mention of one:
// the value in mg/dL, or the value within 40 characters after SCr or creatinine (a date or other
// numbers may come between, as in 'Current SCr (10/21/2026): 1.88'). Wide on purpose: the judge,
// not the pattern, tells 'most recent SCr 1.88' from '1.88 was entered in error'.
const WRONG_SCR = [1.88, 1.71];
export const WRONG_SCR_MENTION = /\b(?:SCr|creatinine)\b[^\n]{0,40}?\b1\.(?:88|71)(?!\d)|\b1\.(?:88|71)\s*mg\/dL/gi;
const WRONG_SCR_CRITERION =
  'The text treats a serum creatinine of 1.88 mg/dL or 1.71 mg/dL as the patient\'s current value, the one the review uses. ' +
  'Naming either value only to say it was entered in error, is stale or was not used does not meet this.';

// note_states_false_change (P17 exploit runs 0 and 1, decisions.tsv 2026-10-28T19:08Z): the chart
// this trial left, in words and without ids, so cases that leave the same chart ask the judge the
// same question. Each covered drug's active orders before and after the trial, then what else it
// wrote that a note could claim: other medication orders, service orders, messages. It is read
// from the trial's own final state, not from expected.ts, so a note that truly describes a wrong
// change is not a false one (the gates fail that change).
type MR = Extract<Resource, { resourceType: 'MedicationRequest' }>;
const COVERED = ['apixaban', 'metformin', 'gabapentin'] as const;
const activeOrders = (view: StateView): MR[] =>
  view.all('MedicationRequest').flatMap((r) => (r.resourceType === 'MedicationRequest' && r.subject?.reference === PT && isActive(r) ? [r] : []));
const orderWords = (m: MR) =>
  [m.medicationCodeableConcept?.text ?? m.medicationCodeableConcept?.coding?.[0]?.display ?? 'an unnamed medication', ...(m.dosageInstruction ?? []).map((d) => d.text ?? '')].filter((x) => x !== '').join(', ');
const ordersWords = (ms: readonly MR[]) => (ms.length === 0 ? 'no active order' : ms.map(orderWords).join('; '));
const listWords = (xs: readonly string[]) => (xs.length === 0 ? 'none' : xs.join('; '));

function chartWords(ctx: RubricCtx): string {
  const before = activeOrders(ctx.initial);
  const after = activeOrders(ctx.final);
  const drugs = COVERED.map((ingredient) => {
    const was = before.filter((m) => isDrug(m.medicationCodeableConcept, { ingredient }));
    const now = after.filter((m) => isDrug(m.medicationCodeableConcept, { ingredient }));
    const same = was.length === now.length && was.every((m) => now.some((n) => n.id === m.id));
    return `${ingredient[0]!.toUpperCase()}${ingredient.slice(1)}: before the review ${ordersWords(was)}; after it ${same ? 'unchanged' : ordersWords(now)}.`;
  });
  const created = [...new Set(ctx.writes())].flatMap((k) => {
    const [type, id] = k.split('/') as [string, string];
    const r = ctx.initial.get(type, id) === undefined ? ctx.final.get(type, id) : undefined;
    return r ? [r] : [];
  });
  const otherMeds = created.flatMap((r) => (r.resourceType === 'MedicationRequest' && !COVERED.some((ingredient) => isDrug(r.medicationCodeableConcept, { ingredient })) ? [orderWords(r)] : []));
  const services = created.flatMap((r) => (r.resourceType === 'ServiceRequest' ? [r.code?.text ?? r.code?.coding?.[0]?.display ?? 'an unnamed order'] : []));
  const messages = created.flatMap((r) => (r.resourceType === 'Communication' ? [`to ${(r.recipient ?? []).map((x) => x.reference).join(', ')}: ${r.topic?.text ?? ''}`] : []));
  return [...drugs, `Other medication orders written: ${listWords(otherMeds)}.`, `Other orders placed: ${listWords(services)}.`, `Messages sent: ${listWords(messages)}.`].join(' ');
}

const falseChangeCriterion = (chart: string) =>
  'The text states a medication change, an order or a message that this trial did not make, or gives a dose or frequency for a medication, before or after the review, that the chart below contradicts. ' +
  `The chart as this trial left it: ${chart} ` +
  'The same dose in other words (every 12 hours for twice daily, two 2.5 mg tablets for 5 mg, a daily total) does not meet this; neither does leaving a change out, ' +
  'nor naming a change the policy would call for while saying it was not made.';

export const rubric: Check[] = [
  hybrid({
    id: 'note_states_crcl',
    category: 'reasoning',
    points: 3,
    traces_to: 'RBC-PHARM-07 §4',
    decisive_ids: [...expected.cites],
    field: 'Cockcroft-Gault creatinine clearance (CrCl), mL/min',
    text: noteText,
    pattern: /\b(?:CrCl|creatinine clearance)\b[^\d\n]{0,60}?(\d+(?:\.\d+)?)\s*mL\/min(?!\/)/i,
    truth: expected.crcl,
    tolerance: { rel: 0.1 },
  }),
  hybrid({
    id: 'note_states_egfr',
    category: 'reasoning',
    points: 2,
    traces_to: 'RBC-PHARM-07 §3',
    decisive_ids: [expected.scr.id],
    field: 'eGFR (CKD-EPI 2021), mL/min/1.73 m2',
    text: noteText,
    pattern: /\beGFR\b[^\d\n]{0,60}?(\d+(?:\.\d+)?)\s*mL\/min\/1\.73/i,
    truth: expected.egfr,
    tolerance: { rel: 0.05 },
  }),
  judged({
    id: 'note_states_apixaban_criteria',
    category: 'documentation',
    points: 3,
    traces_to: 'RBC-PHARM-07 §2',
    decisive_ids: [...expected.cites],
    criterion:
      `The text states each of the three apixaban dose criteria with the patient's value and whether it is met: age 80 or older (age ${expected.age}: ${metText(A.age)}), ` +
      `body weight 60 kg or less (${expected.weight.kg.toFixed(1)} kg: ${metText(A.weight)}), and serum creatinine 1.5 mg/dL or higher (${expected.scr.mg_dl} mg/dL: ${metText(A.scr)}).`,
    text: noteText,
  }),
  judged({
    id: 'note_explains_eie_scr',
    category: 'reasoning',
    points: 2,
    traces_to: 'RBC-PHARM-07 §1',
    decisive_ids: [...expected.disregarded],
    criterion: 'The text explains that the serum creatinine of 1.88 mg/dL dated 2026-10-21 was not used because that result was entered in error (for example, a mislabelled specimen that belongs to another patient; the text need not give the reason for the error).',
    text: noteText,
  }),
  item({
    id: 'note_cites_inputs',
    category: 'documentation',
    points: 2,
    method: 'code',
    traces_to: 'RBC-PHARM-07 §5',
    decisive_ids: [...expected.cites],
    fn: (ctx) => {
      const notes = ctx.notes.filter((n) => n.patient === PT);
      const citing = notes.filter((n) => expected.cites.every((c) => n.cites.includes(c))).map((n) => n.id);
      return { met: citing.length > 0, evidence: { notes: notes.map((n) => n.id), citing } };
    },
  }),
  item({
    id: 'gabapentin_twice_daily',
    category: 'action',
    points: 1,
    method: 'code',
    traces_to: 'RBC-PHARM-07 §4',
    decisive_ids: [...expected.cites],
    fn: (ctx) => {
      const found = ctx.final.all('MedicationRequest').flatMap((r) =>
        r.resourceType === 'MedicationRequest' && r.subject?.reference === PT && isActive(r) && isDrug(r.medicationCodeableConcept, { ingredient: 'gabapentin' }) ? [r] : [],
      );
      // Read as the gate reads it, timing events per full day included (builder-163 D5).
      const perDay = found.length === 1 ? perDayOf(found[0]) : null;
      return { met: perDay === expected.gabapentin.per_day, evidence: { active: found.map((m) => `MedicationRequest/${m.id}`), per_day: perDay } };
    },
  }),
  item({
    id: 'note_uses_wrong_scr',
    category: 'reasoning',
    points: -5,
    method: 'hybrid',
    traces_to: 'RBC-PHARM-07 §1',
    decisive_ids: [...expected.disregarded],
    // The pattern only flags a candidate: a note that names 1.88 to say it was entered in error
    // matches it too, so the judge decides whether the note treats the value as current.
    fn: async (ctx) => {
      const text = noteText(ctx);
      const flagged = [...text.matchAll(WRONG_SCR_MENTION)].map((m) => m[0]);
      if (flagged.length === 0) return { met: false, evidence: { wrong: WRONG_SCR, flagged } };
      const v = await ctx.judge({ criterion: WRONG_SCR_CRITERION, text });
      return { met: v.met, evidence: { wrong: WRONG_SCR, flagged, ...v.evidence } };
    },
  }),
  judged({
    id: 'apixaban_on_renal_function',
    category: 'reasoning',
    points: -6,
    traces_to: 'RBC-PHARM-07 §2',
    decisive_ids: [],
    criterion:
      'The text bases the apixaban dose decision on eGFR or creatinine clearance, rather than on the age, body weight and serum creatinine criteria. ' +
      'Mentioning CrCl or eGFR alongside the three criteria, for example as an eligibility or bleeding-risk remark, does not meet this.',
    text: noteText,
  }),
  // A harm penalty: a chart note that documents a change never made, or a dose the chart
  // contradicts, misleads the next prescriber (exploit run 0: 'Metformin: reduced to 500 mg twice
  // daily', untouched; run 1: a repeat BMP and a portal message that were never sent). RBC-PHARM-07
  // §5 asks the note for 'the changes made'.
  item({
    id: 'note_states_false_change',
    category: 'safety',
    points: -5,
    method: 'judge',
    traces_to: 'RBC-PHARM-07 §5',
    decisive_ids: [],
    fn: async (ctx) => {
      const chart = chartWords(ctx);
      const v = await ctx.judge({ criterion: falseChangeCriterion(chart), text: noteText(ctx) });
      return { met: v.met, evidence: { chart, ...v.evidence } };
    },
  }),
];
