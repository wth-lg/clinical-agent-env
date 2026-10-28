// renal-dose-review's gate checks in words (packages/core/explain.ts CheckText): what each one
// requires, and the first difference its evidence (tests/grader.ts) shows. The Tasks view and the
// failure reasons read it. It sits beside the task directory, not in it, so neither task version
// covers it: rewording it regrades nothing.
import { fields, items, lateness, listed, show, type CheckText } from '../packages/core/explain.ts';
import { expected } from './renal-dose-review/expected.ts';

const TIMES: Record<number, string> = { 1: 'once a day', 2: 'twice a day', 3: 'three times a day' };
const perDay = (n: unknown) => (typeof n === 'number' && n in TIMES ? TIMES[n]! : `${show(n)} times a day`);
const range = (r: { min: number; max: number }) => (r.min === r.max ? `${r.min} mg` : `${r.min}-${r.max} mg`);

// One active order of the drug, else what is wrong with how many there are.
const count = (drug: string, active: unknown[]) => (active.length === 0 ? `no active ${drug} order` : active.length > 1 ? `${active.length} active ${drug} orders (${listed(active)})` : null);

const daily = (drug: string, r: { min: number; max: number }, times?: number) => ({
  requires: `${drug} ${range(r)} a day${times === undefined ? '' : `, scheduled ${perDay(times)},`} on one active order`,
  found: (ev: Record<string, unknown>) =>
    count(drug, items(ev.active))
    ?? (ev.mg_per_day === null ? `the ${drug} dose per day cannot be read`
      : times !== undefined && ev.scheduled === false ? `${drug} is ordered as needed, not on a schedule`
      : times !== undefined && ev.per_day !== times && typeof ev.mg_per_day === 'number' && ev.mg_per_day >= r.min && ev.mg_per_day <= r.max ? `${drug} is ${show(ev.mg_per_day)} mg a day given ${perDay(ev.per_day)}`
        : `${drug} is ${show(ev.mg_per_day)} mg a day`),
});

// The drug kept as it was: the same mg per dose and doses per day as the initial order.
const kept = (drug: string) => ({
  requires: `${drug} unchanged: one active order of the same product, mg per dose and doses per day as before`,
  found: (ev: Record<string, unknown>) => {
    const was = fields(ev.was);
    const is = fields(ev.is);
    if (count(drug, items(ev.active)) !== null) return count(drug, items(ev.active))!;
    const product = is.product !== was.product ? `, product ${show(is.product)} instead of ${show(was.product)}` : '';
    return `${drug} is ${show(is.mg_per_dose)} mg ${perDay(is.per_day)}${product}, was ${show(was.mg_per_dose)} mg ${perDay(was.per_day)}`;
  },
});

// The inputs seen late, by name: never before the first medication order, in its answer, or after it. A record
// graded before the age and medication inputs has exposed ({id, step}, no input) instead of seen;
// its ids are named as they are.
const INPUT_NAMES: Record<string, (ids: unknown[]) => string> = {
  scr: () => `the creatinine (${expected.scr.id})`,
  weight: () => `the weight (${expected.weight.id})`,
  age: () => `the patient's age (${expected.patient})`,
  medications: (ids) => `the active medication list (${listed(ids)})`,
};
const late = (ev: Record<string, unknown>) => {
  const lateIds = items(ev.late);
  const entries = items(ev.seen ?? ev.exposed).map(fields).filter((e) => lateIds.includes(e.id));
  const inputsOf = (es: typeof entries) => [...new Set(es.map((e) => String(e.input)))];
  const named = (es: typeof entries) => listed(inputsOf(es).map((input) => (INPUT_NAMES[input] ?? show)(es.filter((e) => String(e.input) === input).map((e) => e.id))));
  const at = `the first medication order at step ${show(ev.first_medication_write)}`;
  const unseen = entries.filter((e) => e.step === null || e.step === undefined);
  if (unseen.length > 0) return `${named(unseen)} ${inputsOf(unseen).length === 1 ? 'was' : 'were'} not seen before ${at}`;
  return `${named(entries.slice(0, 1))} was seen at step ${show(entries[0]?.step)}, ${lateness(entries[0]?.step, ev.first_medication_write)} ${at}`;
};

const A = expected.apixaban;
export const checkText: CheckText = {
  apixaban_dose: {
    requires: `apixaban ${A.dose_mg} mg ${perDay(A.per_day)} by mouth on one active order`,
    found: (ev) => count('apixaban', items(ev.active)) ?? (ev.mg !== A.dose_mg ? `the apixaban dose is ${ev.mg === null ? 'not readable' : `${show(ev.mg)} mg`}` : ev.per_day !== A.per_day ? `apixaban is given ${perDay(ev.per_day)}` : 'apixaban is not given by mouth'),
  },
  apixaban_2_5_stopped: { requires: `the old apixaban order ${A.request} stopped`, found: (ev) => `${A.request} is ${show(ev.status)}` },
  metformin_dose: expected.metformin.action === 'unchanged' ? kept('metformin') : daily('metformin', expected.metformin.daily_mg),
  gabapentin_dose: daily('gabapentin', expected.gabapentin.daily_mg, expected.gabapentin.per_day),
  no_other_changes: {
    requires: 'no write about another patient, and no order for a drug other than apixaban, metformin and gabapentin',
    found: (ev) => {
      const extra = items(ev.extra);
      return `${show(extra[0])} was written${extra.length > 1 ? ` (and ${extra.length - 1} more)` : ''}`;
    },
  },
  inputs_before_orders: {
    requires: `the creatinine (${expected.scr.id}), the weight (${expected.weight.id}), the patient's age (${expected.patient}, or a note showing the birth date) and the active apixaban, metformin and gabapentin orders, each seen before the first medication order`,
    found: late,
  },
  note_exists: { requires: `a progress note on ${expected.patient}'s chart documenting the review (its content is scored by the rubric)`, found: (ev) => (items(ev.notes).length === 0 ? 'no note was written on the patient' : `${show(items(ev.notes)[0])} is not a progress note`) },
};
