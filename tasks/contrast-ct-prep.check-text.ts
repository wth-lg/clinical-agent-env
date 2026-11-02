// contrast-ct-prep's gate checks in words (packages/core/explain.ts CheckText): what each one
// requires, and the first difference its evidence (tests/grader.ts) shows. Every gate checks each
// study of the list on its own and records each failed study with why (evidence.failed); the
// finding names the first, as a reader knows them. The Tasks view and the failure reasons read it.
// It sits beside the task directory, not in it, so neither task version covers it: rewording it
// regrades nothing.
import { fields, items, show, type CheckText } from '../packages/core/explain.ts';
import { OUTSIDE } from '../packages/grader/items.ts';
import { expected } from './contrast-ct-prep/expected.ts';

const L = expected.items;
// A study as a reader knows it: 'Patient/pt-0046 (Lauren Sixta Beahan, 14:00)'.
const who = (p: unknown) => {
  if (p === OUTSIDE) return 'a patient not on the list';
  const x = L.find((s) => s.patient === p);
  return x === undefined ? show(p) : `${x.patient} (${x.name}, ${x.start.slice(11, 16)})`;
};
const first = (ev: Record<string, unknown>) => {
  const f = fields(items(ev.failed)[0]);
  if (f.item === undefined) return '';
  const more = items(ev.failed).length - 1;
  return `${who(f.item)}: ${f.why === null || f.why === undefined ? 'not met' : show(f.why)}${more > 0 ? ` (and ${more} more ${more === 1 ? 'study' : 'studies'})` : ''}`;
};
const names = (pick: (x: (typeof L)[number]) => boolean) => L.filter(pick).map((x) => x.name.split(' ').at(-1)).join(', ');
// The event gates (packages/grader/events.ts) record only the failed studies, by patient.
const firstItem = (ev: Record<string, unknown>) => {
  const failed = items(ev.failed_items);
  if (failed.length === 0) return '';
  return `${who(failed[0])}${failed.length > 1 ? ` (and ${failed.length - 1} more ${failed.length === 2 ? 'study' : 'studies'})` : ''}`;
};

export const checkText: CheckText = {
  ct_order: { requires: `for every study but one stopped by §3 (${names((x) => x.regimen !== 'no_contrast')}), one active order of the booked study, linked to its appointment and set for its slot`, found: first },
  premedication: { requires: `for the prior mild or moderate contrast reaction (${names((x) => x.regimen === 'premedicate')}), prednisone 50 mg by mouth 13, 7 and 1 hours and diphenhydramine 50 mg by mouth 1 hour before the slot, and at no other time`, found: first },
  creatinine_before_scan: { requires: `a serum creatinine ordered for before the scan where §4 needs a new one (${names((x) => x.creatinine === 'order')}); an order for the scan's date with no time is the right decision in the wrong form`, found: first },
  saline_prophylaxis: { requires: `0.9% sodium chloride IV starting 1 hour before the scan for acute kidney injury or an eGFR under 30 (${names((x) => x.saline !== null)})`, found: first },
  metformin_held: { requires: `no active metformin at the end for acute kidney injury or an eGFR under 30 (${names((x) => x.metformin?.hold === true)})`, found: first },
  radiologist_consulted: { requires: `a message or task to the radiologist (${expected.radiologist}) about the study a prior severe reaction stops (${names((x) => x.regimen === 'no_contrast')})`, found: first },
  no_substitution: { requires: 'no other study in a booked study\'s place, no contrast study after a severe reaction, no premedication where §2 does not apply, no corticosteroid other than §2\'s prednisone, and no order for a patient off the list (committed writes only)', found: first },
  // The mid-trial events (contrast-ct-prep/events.ts) and RBC-RAD-07's preamble sentence on them.
  event_delivered: { requires: "every active event whose trigger held arrived in the chart and the inbox (the environment's part: a miss is an environment error)", found: firstItem },
  had_turn: { requires: 'a model turn after every arrival', found: firstItem },
  event_seen: { requires: "each result or report that arrived during the trial opened, or its deciding line shown, before finishing (the preamble: review anything that arrived after you started)", found: firstItem },
  amended: { requires: 'each decision an arrival changes corrected on the chart as delivered (saline after a kidney injury or a corrected eGFR under 30, premedication after an outside report of a moderate reaction), written after the arrival was read', found: firstItem },
  kept: { requires: 'a decision left in place when an arrival does not change it (an outside reaction report for a CT without contrast, a patient\'s own account of a graded reaction)', found: firstItem },
  evidence_before_orders: { requires: "the records each of a study's order decisions turns on (the report of the day, the diabetes that makes a creatinine due, the creatinine whose eGFR is under 30, the record of the kidney injury) seen before every order that decision places; messages and consults are not orders", found: first },
};
