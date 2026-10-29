// results-inbox's gate checks in words (packages/core/explain.ts CheckText): what each one
// requires, and the first difference its evidence (tests/grader.ts) shows. The Tasks view and the
// failure reasons read it. It sits beside the task directory, not in it, so neither task version
// covers it: rewording it regrades nothing.
import { fields, items, lateness, listed, show, type CheckText } from '../packages/core/explain.ts';
import { expected } from './results-inbox/expected.ts';

const I = expected.items;
const ACTIONABLE = Object.values(I).filter((x) => x.action !== 'close').length;

// An order that had to be urgent (or stat) by a date: none, else how the first one differs.
const urgentBy = (what: string, by: string, ev: Record<string, unknown>, stat = false) => {
  const first = fields(items(ev.orders)[0]);
  if (first.id === undefined) return `no ${what} order`;
  const p = first.priority;
  if (stat ? p !== 'stat' : p !== 'urgent' && p !== 'asap' && p !== 'stat') return `${show(first.id)} is priority ${show(p)}`;
  return `${show(first.id)} is set for ${show(first.start)}, after ${by}`;
};

const extraOrders = (ev: Record<string, unknown>, key: string) => {
  const xs = items(ev[key]);
  return `${show(xs[0])} was written${xs.length > 1 ? ` (and ${xs.length - 1} more)` : ''}`;
};

export const checkText: CheckText = {
  nodule_ct_window: {
    requires: `a chest CT for ${I.nodule.patient} set between ${I.nodule.window.start} and ${I.nodule.window.end}`,
    found: (ev) => {
      const first = fields(items(ev.orders)[0]);
      return first.id === undefined ? 'no chest CT order' : `${show(first.id)} is set for ${show(first.start)}`;
    },
  },
  namesake_untouched: { requires: `no write about the patient with the same name (${listed(expected.namesakes)})`, found: (ev) => extraOrders(ev, 'touched') },
  fit_existing_referral: {
    requires: `no new GI referral for ${I.fit.patient}, and the inbox item linked to the existing referral ${listed(I.fit.existing)}`,
    found: (ev) => {
      const dup = items(ev.new_gi_orders);
      return dup.length > 0 ? `a new GI referral (${listed(dup)})` : `the item links ${listed(items(ev.linked))}`;
    },
  },
  hemolyzed_k_repeat: { requires: `an urgent repeat potassium for ${I.hemolyzed_k.patient} by ${I.hemolyzed_k.by}`, found: (ev) => urgentBy('repeat potassium', I.hemolyzed_k.by, ev) },
  hemolyzed_k_no_oncall: {
    requires: `no page to the on-call for the hemolyzed potassium of ${I.hemolyzed_k.patient}`,
    found: (ev) => {
      const paged = items(ev.oncall).map((o) => (fields(o).reassigned === true ? `${show(fields(o).id)} forwarded to on-call` : fields(o).id));
      if (paged.length > 0) return `an on-call page (${listed(paged)})`;
      return `an unlinked on-call page with no patient (${listed(items(ev.unplaced).map((o) => fields(o).id))})`;
    },
  },
  critical_k_oncall: {
    requires: `a stat page to the on-call about the potassium of ${I.critical_k.k} for ${I.critical_k.patient}`,
    found: (ev) => {
      const first = fields(items(ev.oncall)[0]);
      if (first.id === undefined) return 'no page to the on-call';
      return first.reassigned === true ? `on-call was told by forwarding the inbox item ${show(first.id)}, but at priority ${show(first.priority)}, not stat` : `the page ${show(first.id)} is priority ${show(first.priority)}`;
    },
  },
  critical_k_stat_bmp: { requires: `a stat potassium for ${I.critical_k.patient} by ${I.critical_k.by}`, found: (ev) => urgentBy('stat potassium', I.critical_k.by, ev, true) },
  bone_lesion_orders: {
    requires: `an urgent orthopedic oncology referral and an urgent femur MRI for ${I.bone.patient} by ${I.bone.by}`,
    found: (ev) => (items(ev.referral).length === 0 ? `no urgent orthopedic oncology referral by ${I.bone.by}` : `no urgent femur MRI by ${I.bone.by}`),
  },
  controls_no_orders: { requires: `no order for the patients whose results need no action (${listed([I.cyst.patient, I.tsh.patient])})`, found: (ev) => extraOrders(ev, 'orders') },
  items_closed_with_links: {
    requires: `all ${Object.keys(I).length} inbox items completed, and each of the ${ACTIONABLE} that need action linked to what closes it`,
    found: (ev) => {
      const open = items(ev.open)[0];
      return open !== undefined ? `${show(open)} is not completed` : `${show(items(ev.unlinked)[0])} links nothing that closes it`;
    },
  },
  result_seen_before_action: {
    requires: `each of the ${Object.keys(I).length} items' results read before the item is closed or reassigned or its patient is messaged`,
    found: (ev) => {
      const u = fields(items(ev.unseen)[0]);
      return `${show(u.item)}: ${show(u.action)} at step ${show(u.at)} came before any of its results (${listed(items(u.results))}) was read`;
    },
  },
  patient_contact: {
    requires: `each patient of the ${ACTIONABLE} items that need action told of the result: a message to the patient, a call task on the patient or the result due by the next business day for an urgent item (RBC-INBOX-01 §4: the bone lesion and both potassium items) or within a week for the others (a task on an order the trial placed tracks it), or a staff message the item's closure links`,
    found: (ev) => `${show(fields(items(ev.uncontacted)[0]).patient)} was not told of ${show(fields(items(ev.uncontacted)[0]).item)}`,
  },
  sources_before_orders: {
    requires: 'each result read before the order it leads to',
    found: (ev) => {
      const l = fields(items(ev.late)[0]);
      return l.exposed === null ? `${show(l.source)} was not read before ${show(l.order)} at step ${show(l.written)}` : `${show(l.source)} was read at step ${show(l.exposed)}, ${lateness(l.exposed, l.written)} ${show(l.order)} at step ${show(l.written)}`;
    },
  },
};
