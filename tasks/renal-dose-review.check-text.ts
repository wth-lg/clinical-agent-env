// renal-dose-review's gate checks in words (packages/core/explain.ts CheckText): what each one
// requires, and the first difference its evidence (tests/grader.ts) shows. The Tasks view and the
// failure reasons read it. It sits beside the task directory, not in it, so neither task version
// covers it: rewording it regrades nothing.
import { fields, items, listed, show, type CheckText } from '../packages/core/explain.ts';
import { expected } from './renal-dose-review/expected.ts';

const TIMES: Record<number, string> = { 1: 'once a day', 2: 'twice a day', 3: 'three times a day' };
const perDay = (n: unknown) => (typeof n === 'number' && n in TIMES ? TIMES[n]! : `${show(n)} times a day`);
const range = (r: { min: number; max: number }) => (r.min === r.max ? `${r.min} mg` : `${r.min}-${r.max} mg`);

// One active order of the drug, else what is wrong with how many there are.
const count = (drug: string, active: unknown[]) => (active.length === 0 ? `no active ${drug} order` : active.length > 1 ? `${active.length} active ${drug} orders (${listed(active)})` : null);

const daily = (drug: string, r: { min: number; max: number }, times?: number) => ({
  requires: `${drug} ${range(r)} a day${times === undefined ? '' : `, ${perDay(times)},`} on one active order`,
  found: (ev: Record<string, unknown>) =>
    count(drug, items(ev.active))
    ?? (ev.mg_per_day === null ? `the ${drug} dose per day cannot be read`
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

// An input read late: never before the first medication order, or after it.
const late = (ev: Record<string, unknown>) => {
  const id = items(ev.late)[0];
  const step = fields(items(ev.exposed).map(fields).find((e) => e.id === id)).step;
  return step === null || step === undefined ? `${show(id)} was not read before the first medication order at step ${show(ev.first_medication_write)}` : `${show(id)} was read at step ${show(step)}, after the first medication order at step ${show(ev.first_medication_write)}`;
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
  inputs_before_orders: { requires: `the creatinine (${expected.scr.id}) and the weight (${expected.weight.id}) read before the first medication order`, found: late },
  note_exists: { requires: `a note on ${expected.patient}'s chart documenting the review (its content is scored by the rubric)`, found: () => 'no note was written on the patient' },
};
