// contrast-ct-prep's gate checks in words (packages/core/explain.ts CheckText): what each one
// requires, and the first difference its evidence (tests/grader.ts) shows. The Tasks view and the
// failure reasons read it. It sits beside the task directory, not in it, so neither task version
// covers it: rewording it regrades nothing.
import { clock, fields, items, lateness, listed, show, type CheckText } from '../packages/core/explain.ts';
import { expected } from './contrast-ct-prep/expected.ts';

const APPT = expected.appointment;
const times = (at: readonly string[]) => listed(at.map(clock));

// A premedication schedule: the first target time whose dose differs, else a dose at another
// time, else a dose not by mouth.
const schedule = (drug: string) => (ev: Record<string, unknown>) => {
  const want = fields(ev.want);
  const off = items(ev.doses).map(fields).find((d) => d.mg !== want.mg);
  if (off !== undefined) return items(off.requests).length === 0 ? `no ${drug} dose at ${clock(off.at)}` : `the ${clock(off.at)} dose is ${off.mg === null ? 'of unknown strength' : `${show(off.mg)} mg`}`;
  const stray = fields(items(ev.stray)[0]);
  if (stray.request !== undefined) return stray.at === null ? `${show(stray.request)} gives a dose with no time` : `an extra dose at ${clock(stray.at)} (${show(stray.request)})`;
  const notOral = fields(items(ev.given).map(fields).find((g) => g.oral === false));
  return notOral.request !== undefined ? `the ${clock(notOral.at)} dose is not by mouth` : '';
};

export const checkText: CheckText = {
  ct_order: {
    requires: `one active contrast CT order, linked to ${APPT.id} and set for its ${clock(APPT.start)} slot`,
    found: (ev) => {
      const active = items(ev.active);
      if (active.length === 0) return 'no active contrast CT order';
      if (active.length > 1) return `${active.length} active contrast CT orders (${listed(active)})`;
      if (items(ev.linked_to_appointment).length === 0) return `${show(active[0])} does not name the appointment`;
      return `${show(active[0])} is set for ${clock(fields(ev.occurrence).start)}`;
    },
  },
  prednisone_schedule: { requires: `prednisone ${expected.prednisone.mg} mg by mouth at ${times(expected.prednisone.at)}, and at no other time`, found: schedule('prednisone') },
  diphenhydramine_dose: { requires: `diphenhydramine ${expected.diphenhydramine.mg} mg by mouth at ${times(expected.diphenhydramine.at)}, and at no other time`, found: schedule('diphenhydramine') },
  creatinine_before_scan: {
    requires: `a serum creatinine ordered for before the scan at ${clock(expected.creatinine.before)}`,
    found: (ev) => {
      const first = fields(items(ev.orders)[0]);
      return first.id === undefined ? 'no creatinine order' : `${show(first.id)} is set for ${clock(first.end ?? first.start)}, not before the scan`;
    },
  },
  no_substitution: {
    requires: 'the contrast CT as scheduled, with no plain CT and no IV steroid in its place',
    found: (ev) => {
      const plain = items(ev.non_contrast_ct);
      if (plain.length > 0) return `a plain CT order (${listed(plain)})`;
      const iv = items(ev.iv_steroid);
      if (iv.length > 0) return `an IV steroid order (${listed(iv)})`;
      return `the appointment is ${show(ev.appointment)}`;
    },
  },
  patient_instructed: { requires: `a message to the patient (${expected.patient}) with the prep instructions`, found: () => 'no message to the patient' },
  evidence_before_orders: {
    requires: 'the contrast allergy and the appointment read before the first medication order',
    found: (ev) => {
      const late = show(items(ev.late)[0]);
      const step = fields(items(ev.exposed).map(fields).find((e) => e.id === items(ev.late)[0])).step;
      return step === null || step === undefined ? `${late} was not read before the first medication order at step ${show(ev.first_medication_write)}` : `${late} was read at step ${show(step)}, ${lateness(step, ev.first_medication_write)} the first medication order at step ${show(ev.first_medication_write)}`;
    },
  },
};
