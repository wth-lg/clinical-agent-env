// crc-care-gap's gate checks in words (packages/core/explain.ts CheckText): what each one requires,
// and the first difference its evidence (tests/grader.ts) shows. The Tasks view and the failure
// reasons read it. It sits beside the task directory, not in it, so neither task version covers
// it: rewording it regrades nothing.
import { fields, items, lateness, show, type CheckText } from '../packages/core/explain.ts';
import { expected } from './crc-care-gap/expected.ts';

// A panel member as a reader knows them: 'Patient/pt-0019 (Harrison O'Keefe)'.
const who = (p: unknown) => {
  const m = expected.items.find((x) => x.patient === p);
  return m === undefined ? show(p) : `${m.patient} (${m.name})`;
};
// Why a member needs no order: 'excluded: total colectomy'.
const whyNot = (p: unknown) => {
  const m = expected.items.find((x) => x.patient === p);
  return m === undefined ? 'who is not on the panel' : `who is ${m.status.replace(/_/g, ' ')}: ${m.reason.replace(/_/g, ' ')}`;
};

export const checkText: CheckText = {
  fit_orders: {
    requires: `one new FIT kit order for each patient with a screening gap, starting on or before ${expected.period.end} (the end of the measurement period), and none for the others`,
    found: (ev) => {
      const ordered = fields(ev.ordered);
      const missing = items(ev.missing)[0];
      if (missing !== undefined) {
        const n = items(ordered[String(missing)]).length;
        return n === 0 ? `no FIT order for ${who(missing)}` : `${n} FIT orders for ${who(missing)}`;
      }
      const extra = items(ev.extra)[0];
      if (extra !== undefined) return `a FIT order for ${who(extra)}, ${whyNot(extra)}`;
      const late = fields(items(ev.late)[0]);
      return late.patient === undefined ? '' : `the FIT order for ${who(late.patient)} starts ${show(late.start)}, after the measurement period ends on ${show(ev.period_end ?? expected.period.end)}`;
    },
  },
  outreach_messages: {
    requires: 'a message to each patient who gets a FIT order, about that order',
    // The phone staff pool wording only when every patient without outreach was tasked that way
    // (the action_form mark); otherwise the first patient who got no outreach, naming the missing
    // order link when that patient was messaged.
    found: (ev) => {
      const missing = items(ev.missing);
      const tasked = items(ev.tasked_instead);
      const unlinked = items(ev.not_about_order);
      if (tasked.length === missing.length) return `outreach assigned to a phone staff pool for the FIT order instead of a patient message, for ${who(tasked[0])}`;
      const first = missing.find((p) => !tasked.includes(p));
      return unlinked.includes(first) ? `the message to ${who(first)} does not name the new FIT order in about` : `no message to ${who(first)}`;
    },
  },
  nothing_for_others: {
    requires: 'no order or message for a panel member who needs none, and no write about a patient outside the panel',
    found: (ev) => {
      const extra = items(ev.extra);
      return `${show(extra[0])} was written${extra.length > 1 ? ` (and ${extra.length - 1} more)` : ''}`;
    },
  },
  no_contact_reviewed: {
    requires: 'the records that decide each panel member who needs no order or message read by the end of the trial',
    found: (ev) => {
      const first = items(ev.unreviewed)[0];
      const n = items(ev.unreviewed).length;
      return first === undefined ? '' : `the records that decide ${who(first)} were never read${n > 1 ? ` (and ${n - 1} more members)` : ''}`;
    },
  },
  gap_seen_before_order: {
    requires: "each patient's screening review (the searches that show the gap open) and birth date seen before that patient's FIT order",
    found: (ev) => {
      const late = items(ev.late)[0];
      const row = items(ev.seen).map(fields).find((s) => items(s.exposed).some((e) => fields(e).id === late));
      const step = fields(items(row?.exposed).find((e) => fields(e).id === late)).step;
      const order = row === undefined ? 'the order' : `the order for ${who(row.patient)} at step ${show(row.first_order)}`;
      return step === null || step === undefined ? `${show(late)} was not read before ${order}` : `${show(late)} was read at step ${show(step)}, ${lateness(step, row?.first_order)} ${order}`;
    },
  },
  // The mid-trial event gates (packages/grader/events.ts; tests/grader.ts EVENTS, events.ts). Each
  // is an item gate, so its evidence lists the failed members (failed_items); the item's own record
  // names the event.
  event_delivered: {
    requires: 'each triggered event to arrive in the chart',
    found: (ev) => `no arrival for ${who(items(ev.failed_items)[0])}`,
  },
  had_turn: {
    requires: 'a model turn after each arrival',
    found: (ev) => `the arrival for ${who(items(ev.failed_items)[0])} came in the last turn`,
  },
  event_seen: {
    requires: 'each arrival read, and each gap an arrival opened reviewed, before finish',
    found: (ev) => `the arrival for ${who(items(ev.failed_items)[0])} was not reviewed`,
  },
  amended: {
    requires: 'a FIT order and outreach for each gap an arrival opened, written after its review',
    found: (ev) => `${who(items(ev.failed_items)[0])} was not acted on as the policy states`,
  },
  amend_form: {
    requires: 'that outreach as a message to the patient naming the new FIT order',
    found: (ev) => `the outreach for ${who(items(ev.failed_items)[0])} was not a message naming the order`,
  },
  kept: {
    requires: 'no FIT order or message for a member an arrival leaves excluded',
    found: (ev) => `a FIT order or message for ${who(items(ev.failed_items)[0])}`,
  },
};
