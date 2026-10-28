// discharge-medrec's gate checks in words (packages/core/explain.ts CheckText): what each one
// requires, and the first difference its evidence (tests/grader.ts) shows. The Tasks view and the
// failure reasons read it. It sits beside the task directory, not in it, so neither task version
// covers it: rewording it regrades nothing.
import { fields, items, listed, show, type CheckText } from '../packages/core/explain.ts';
import { expected } from './discharge-medrec/expected.ts';

const TIMES: Record<number, string> = { 1: 'once a day', 2: 'twice a day', 3: 'three times a day' };
const perDay = (n: unknown) => (typeof n === 'number' && n in TIMES ? TIMES[n]! : `${show(n)} times a day`);

// One active order of the drug at its daily dose and frequency: the first thing that differs.
const oneAt = (drug: string, spec: { daily_mg: number; per_day: number }) => (ev: Record<string, unknown>): string => {
  const active = items(ev.active);
  if (active.length === 0) return `no active ${drug} order`;
  if (active.length > 1) return `${active.length} active ${drug} orders (${listed(active)})`;
  if (ev.mg_per_day !== spec.daily_mg) return ev.mg_per_day === null ? `the ${drug} dose per day cannot be read` : `${drug} is ${show(ev.mg_per_day)} mg a day`;
  return ev.per_day !== spec.per_day ? `${drug} is given ${perDay(ev.per_day)}` : '';
};
const dose = (drug: string, spec: { daily_mg: number; per_day: number }) => `${drug} ${spec.daily_mg} mg ${perDay(spec.per_day)} on one active order`;

const F = expected.furosemide;
const L = expected.lisinopril;
const K = expected.potassium_chloride;
const S = expected.sources;
const OMEPRAZOLE = expected.unchanged.find((k) => k.endsWith('omeprazole'))!;
const KEPT = expected.unchanged.filter((k) => k !== OMEPRAZOLE);

export const checkText: CheckText = {
  furosemide_40: {
    requires: `${dose('furosemide', F)}, replacing ${F.request}`,
    found: (ev) => oneAt('furosemide', F)(ev) || `the old order ${F.request} is still ${show(ev.old_request)}`,
  },
  spironolactone_25: { requires: `${dose('spironolactone', expected.spironolactone)}, as the discharge addendum corrects it`, found: oneAt('spironolactone', expected.spironolactone) },
  kcl_stopped: {
    requires: `potassium chloride stopped (${K.request}), with no other active or held order of it`,
    found: (ev) => {
      const left = items(ev.left);
      return ev.status !== 'stopped' && ev.status !== 'completed' ? `${K.request} is ${show(ev.status)}` : `${listed(left)} is still ${left.length > 1 ? 'open' : 'active or on hold'}`;
    },
  },
  lisinopril_resumed: {
    requires: `${dose('lisinopril', L)}, with no lisinopril order left on hold`,
    found: (ev) => {
      const held = items(ev.still_held);
      if (held.length > 0) return `${listed(held)} is still on hold${items(ev.active).length === 0 ? ', and no lisinopril order is active' : ''}`;
      return oneAt('lisinopril', L)(ev);
    },
  },
  others_unchanged: {
    requires: `${listed(KEPT)} left active and unchanged, and no other new medication order`,
    found: (ev) => {
      const touched = items(ev.touched);
      if (touched.length > 0) return `${show(touched[0])} was changed`;
      return `a new medication order ${show(items(ev.extra)[0])}`;
    },
  },
  omeprazole_kept: {
    requires: `omeprazole (${OMEPRAZOLE}) left active and unchanged, and no pantoprazole order`,
    found: (ev) => {
      const panto = items(ev.pantoprazole);
      if (panto.length > 0) return `a pantoprazole order (${listed(panto)})`;
      return ev.omeprazole === 'active' ? 'the omeprazole order was rewritten' : `omeprazole is ${show(ev.omeprazole)}`;
    },
  },
  pcp_message: {
    requires: `a message to the patient's PCP about ${listed(expected.message_about)}, or a Task for the PCP whose focus is it`,
    found: (ev) => `no message or Task to the PCP (${listed(items(ev.pcp))}) about it`,
  },
  sources_before_orders: {
    requires:
      `each medication order write after its source was shown (RBC-TOC-02 §1): the discharge summary's line (${S.summary}) for the furosemide, potassium chloride and lisinopril changes, ` +
      `the addendum's correction (${S.addendum}) for spironolactone, the creatinine (${expected.scr.id}) for the lisinopril resume (§2), and the summary read before an order of any other drug`,
    found: (ev) => {
      const l = fields(items(ev.late)[0]);
      const source = typeof l.line === 'string' ? `"${l.line}" in ${show(l.id)}` : show(l.id);
      return `the ${show(l.change)} order at step ${show(l.step)} came before ${source} was shown (${show(l.policy)})`;
    },
  },
};
