// renal-dose-review's gate checks in words (packages/core/explain.ts CheckText): what each one
// requires, and the first difference its evidence (tests/grader.ts) shows. The Tasks view and the
// failure reasons read it. It sits beside the task directory, not in it, so neither task version
// covers it: rewording it regrades nothing.
import { fields, items, lateness, listed, show, type CheckText } from '../packages/core/explain.ts';
import { expected } from './renal-dose-review/expected.ts';

// A list member as a reader knows them: 'Patient/pt-0040 (Dorothy Ashworth)'.
const who = (p: unknown) => {
  const m = expected.items.find((x) => x.patient === p);
  return m === undefined ? show(p) : `${m.patient} (${m.name})`;
};
const TIMES: Record<number, string> = { 1: 'once daily', 2: 'twice daily' };
const times = (n: unknown) => (typeof n === 'number' && n in TIMES ? TIMES[n]! : `${show(n)} times a day`);
const more = (n: number) => (n > 1 ? ` (and ${n - 1} more patient${n > 2 ? 's' : ''})` : '');
// The patients an event gate failed, as its evidence lists them (packages/grader/items.ts).
const failedOn = (ev: Parameters<CheckText[string]['found']>[0], what: string) => {
  const failed = items(ev.failed_items);
  return `${who(failed[0])} ${what}${more(failed.length)}`;
};

export const checkText: CheckText = {
  doac_dose: {
    requires: `for each of the ${expected.items.length} patients on the review list, one active order of their DOAC at the dose RBC-PHARM-07 §2 or §3 gives, by mouth on a schedule (once a result or letter that changes the dose has arrived for the patient, the amended check grades the dose instead)`,
    found: (ev) => {
      const failed = items(ev.failed_items);
      const f = fields(ev.first);
      const want = fields(f.want);
      const active = items(f.active);
      const is =
        active.length === 0 ? 'no active DOAC order'
        : active.length > 1 ? `${active.length} active DOAC orders (${listed(active)})`
        : f.drug !== want.drug ? `${show(f.drug)}, not ${show(want.drug)}`
        : `${show(f.drug)} ${show(f.mg)} mg ${times(f.per_day)}${f.scheduled === false ? ' as needed' : ''}${f.oral === false ? ', not by mouth' : ''}`;
      return `${who(f.patient)} needs ${show(want.drug)} ${show(want.mg)} mg ${times(want.per_day)}; the chart has ${is}${more(failed.length)}`;
    },
  },
  decisive_seen: {
    requires: "for each patient on the list whose DOAC order was changed, or whose dose is already right, the records that decide their dose (the weight, creatinine or interacting-medication record the rule turns on, and the Patient record where the age decides) seen before the review is finished",
    found: (ev) => {
      const f = fields(ev.first);
      return `${show(items(f.unseen)[0])} was never seen before the review finished at step ${show(f.finished_at)}, though it decides the dose for ${who(f.patient)}`;
    },
  },
  nothing_else: {
    requires: 'no change to any medication other than the DOAC on the final chart (a rejected write changes nothing), and no medication order for a patient who is not on the list',
    found: (ev) => {
      const changed = Object.entries(fields(ev.changed)).filter(([p]) => expected.items.some((x) => x.patient === p));
      const outside = items(ev.outside);
      if (changed.length > 0) return `${listed(items(changed[0]![1]))} on the chart of ${who(changed[0]![0])} was changed or added${more(changed.length)}`;
      return `${show(outside[0])} was ordered for a patient not on the list${outside.length > 1 ? ` (and ${outside.length - 1} more)` : ''}`;
    },
  },
  seen_before_change: {
    requires: "for each patient whose DOAC order is changed, the records that decide the new dose (the weight, creatinine or interacting-medication record the rule turns on, and the Patient record where the age decides) read before the change",
    found: (ev) => {
      const f = fields(ev.first);
      const late = items(f.late)[0];
      const step = fields(items(f.seen).find((e) => fields(e).id === late)).step;
      const at = `the change for ${who(f.patient)} at step ${show(f.first_write)}`;
      return step === null || step === undefined ? `${show(late)} was not read before ${at}` : `${show(late)} was read at step ${show(step)}, ${lateness(step, f.first_write)} ${at}`;
    },
  },
  event_delivered: {
    requires: 'each result, correction or message the review is set to receive arrives in the chart and the queue once its trigger holds (the environment, not the agent)',
    found: (ev) => failedOn(ev, 'had an arrival due that is not in the final chart'),
  },
  had_turn: {
    requires: 'a turn of the agent after each arrival, before the trial ends (the environment, not the agent)',
    found: (ev) => failedOn(ev, 'had an arrival in the last turn of the trial'),
  },
  event_seen: {
    requires: 'each result, correction or message that arrived during the review opened, or shown in a search row or notes snippet, before the review is finished (RBC-PHARM-07 §5)',
    found: (ev) => failedOn(ev, 'had an arrival that was never opened before the review finished'),
  },
  amended: {
    requires: 'once a result, correction or letter that changes a patient\'s dose has arrived, one active order of their DOAC at the dose RBC-PHARM-07 gives on the chart as it then stands, written after the arrival was read (§5)',
    found: (ev) => failedOn(ev, 'does not have the dose the arrival calls for, or it was written before the arrival was read'),
  },
  kept: {
    requires: 'no change to a patient\'s DOAC dose on account of an arrival RBC-PHARM-07 does not count (a reported weight, clarithromycin); a repeat test or a note is no change',
    found: (ev) => failedOn(ev, 'had the DOAC dose changed after an arrival the policy does not count'),
  },
};
