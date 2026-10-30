// message-queue's gate checks in words (packages/core/explain.ts CheckText): what each one
// requires, and the first difference its evidence (tests/grader.ts) shows. The Tasks view and the
// failure reasons read it. It sits beside the task directory, not in it, so neither task version
// covers it: rewording it regrades nothing.
import { fields, items, lateness, listed, show, type CheckText } from '../packages/core/explain.ts';
import { expected as M } from './message-queue/expected.ts';

// A refill on these terms: no order, else the first order term that differs.
const terms = (spec: { drug: string; daily_mg: number; supply_days: number; refills: number }) => `${spec.drug} ${spec.daily_mg} mg a day for ${spec.supply_days} days with ${spec.refills} ${spec.refills === 1 ? 'refill' : 'refills'}`;
const refill = (drug: string, ev: Record<string, unknown>): string => {
  const orders = items(ev.orders).map(fields);
  if (orders.length === 0) return `no new ${drug} order`;
  const want = fields(ev.want);
  for (const o of orders) {
    if (o.status === 'entered-in-error' || o.status === 'cancelled' || o.status === 'stopped') continue;
    if (o.active !== true) return `${show(o.id)} is ${show(o.status)}`;
    if (o.mg_per_day !== want.mg_per_day) return `${show(o.id)} gives ${show(o.mg_per_day)} mg a day`;
    if (o.supply_days !== want.supply_days) return `${show(o.id)} gives ${show(o.supply_days)} days of supply`;
    if (o.refills !== want.refills) return `${show(o.id)} allows ${show(o.refills)} refills`;
  }
  return orders.every((o) => o.active !== true) ? `every new ${drug} order is voided` : '';
};

// A record read late: never before the write it must come before, in the same answer, or after it.
const lateRead = (id: unknown, exposed: unknown, write: unknown) =>
  exposed === null || exposed === undefined ? `${show(id)} was not read before the write at step ${show(write)}` : `${show(id)} was read at step ${show(exposed)}, ${lateness(exposed, write)} the write at step ${show(write)}`;

const writes = (ev: Record<string, unknown>) => {
  const extra = items(ev.extra);
  return `${show(extra[0])} was written${extra.length > 1 ? ` (and ${extra.length - 1} more)` : ''}`;
};

export const checkText: CheckText = {
  m1_hyperk_hold: {
    requires: `no new ACE inhibitor or ARB order for ${M.m1.patient} (the ${M.m1.bmp_date} BMP shows potassium ${M.m1.potassium}), and a task to the PCP about ${M.m1.request}`,
    found: (ev) => {
      const orders = items(ev.new_orders);
      return orders.length > 0 ? `a new ACE inhibitor or ARB order (${listed(orders)})` : `no task to the PCP (${show(ev.pcp)})`;
    },
  },
  m2_no_refill: {
    requires: `no new statin order for ${M.m2.patient}, and a task to the PCP about ${M.m2.request}`,
    found: (ev) => {
      const orders = items(ev.new_orders);
      return orders.length > 0 ? `a new statin order (${listed(orders)})` : `no task to the PCP (${show(ev.pcp)})`;
    },
  },
  m3_red_flag: {
    requires: `a stat task to the RN triage pool (${M.m3.pool}) and an urgent message to ${M.m3.patient}`,
    found: (ev) => (items(ev.stat_triage_tasks).length === 0 ? 'no stat task to the triage pool' : 'no urgent message to the patient'),
  },
  m4_hold: {
    requires: `no new order for ${M.m4.patient}, a high-criticality penicillin allergy with its immediate reaction recorded, and a message to ${M.m4.requester}`,
    found: (ev) => {
      const orders = items(ev.new_orders);
      if (orders.length > 0) return `a new order (${listed(orders)})`;
      if (items(ev.allergy_recorded).length === 0) {
        const written = items(ev.allergies_written);
        return written.length === 0 ? 'no penicillin allergy recorded' : `${show(written[0])} lacks high criticality, the penicillin code or the immediate reaction`;
      }
      return `no message to ${M.m4.requester}`;
    },
  },
  m5_renewal: { requires: `a renewal of ${terms(M.m5)} for ${M.m5.patient}`, found: (ev) => refill(M.m5.drug, ev) },
  m6_scheduling: {
    requires: `the request sent to the scheduling pool (${M.m6.pool}), by a new task or by reassigning ${M.m6.item}`,
    found: () => 'no task to the scheduling pool, and the item is not reassigned',
  },
  all_cleared: {
    requires: `all ${M.items.length} queue items completed, cancelled or rejected, or reassigned as their protocol routes them: ${M.m3.item} to ${M.m3.pool}, ${M.m6.item} to ${M.m6.pool}`,
    found: (ev) => {
      const open = items(ev.still_open)[0];
      const item = fields(items(ev.items).map(fields).find((i) => i.item === open));
      if (item.owner === 'Practitioner/pr-okafor') return `${show(open)} is still ${show(item.status)} with ${show(item.owner)}`;
      if (item.routed_to === null || item.routed_to === undefined) return `${show(open)} was reassigned to ${show(item.owner)}, which its protocol does not route it to, so it is still open`;
      return `${show(open)} was reassigned to ${show(item.owner)}, but its protocol routes it to ${show(item.routed_to)}`;
    },
  },
  evidence_before_writes: {
    requires: `the urgent-care note (${M.m4.reaction_note}) read before the allergy is recorded, and the potassium on the pre-admission report (${M.m1.bmp}) read before the PCP task or a new ACE inhibitor or ARB order`,
    found: (ev) => {
      const id = items(ev.late)[0];
      const c = fields(items(ev.checks).map(fields).find((x) => x.evidence === id));
      return lateRead(id, c.exposed, c.write);
    },
  },
  no_other_changes: { requires: 'every write about one of the six queue patients', found: writes },
};
