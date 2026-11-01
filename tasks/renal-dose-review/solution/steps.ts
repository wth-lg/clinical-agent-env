// The tool calls T1's scripts are made of (worklist probe, builder-211): the oracle (solve.ts) and
// the matrix's alternatives, mutants and agents (tests/). The oracle takes the route RBC-PHARM-07
// implies, one patient at a time: the policy and the review list first; then, per patient, the
// Patient (age), the active orders (the DOAC and any inhibitor), the recent laboratory results of
// every code (an outside creatinine in umol/L is under its own code), the measured weights, and the
// notes of the last 90 days (an outside clinic's letter), reading a letter from outside the clinic;
// then the change and its note. Each case varies only what its clinician would vary. Before it
// finishes, it re-checks its queues (RBC-PHARM-07 §5): it lists the results and messages queues,
// reads each item that arrived, and corrects the dose an arrival changes, in a later turn, with a
// note (RECHECK). A correction names the patient's DOAC order as the trial left it, which the
// script resolves to the id the write that created it gets (resolve).
import type { ScriptCall, ScriptTurn } from '../../../packages/grader/matrix/types.ts';
import { ACTIVE, ARRIVAL, SPECS } from '../events.ts';
import { id, ref } from '../ids.ts';

export const RX = {
  apixaban2_5: '1364435',
  apixaban5: '1364445',
  rivaroxaban15: '1232082',
  rivaroxaban20: '1232086',
} as const;

export const policy: ScriptCall = { name: 'read_policy', input: { policy_id: 'RBC-PHARM-07' } };
export const groups: ScriptCall = { name: 'fhir_search', input: { resource_type: 'Group' } };
export const group: ScriptCall = { name: 'fhir_read', input: { resource_type: 'Group', id: id('grp-t1-doac') } };
export const read = (resource_type: string, rid: string): ScriptCall => ({ name: 'fhir_read', input: { resource_type, id: rid } });
export const search = (resource_type: string, patient: string, more: { [k: string]: string | number } = {}): ScriptCall => ({ name: 'fhir_search', input: { resource_type, patient, ...more } });
export const calc = (expression: string): ScriptCall => ({ name: 'calculate', input: { expression } });
export const finish = (summary: string): ScriptCall => ({ name: 'finish', input: { summary } });

// One patient's reads, as §1 lists the inputs.
export const patientRead = (p: string): ScriptCall => read('Patient', p);
export const activeMeds = (p: string): ScriptCall => search('MedicationRequest', p, { status: 'active' });
export const labs = (p: string): ScriptCall => search('Observation', p, { category: 'laboratory', date_ge: '2026-04-01', sort: '-date' });
export const clinicScr = (p: string): ScriptCall => search('Observation', p, { code: '2160-0', sort: '-date' });
export const weights = (p: string): ScriptCall => search('Observation', p, { code: '29463-7', sort: '-date' });
export const weightsOldestFirst = (p: string): ScriptCall => search('Observation', p, { code: '29463-7' });
export const allVitals = (p: string): ScriptCall => search('Observation', p, { category: 'vital-signs', date_ge: '2026-04-01', sort: '-date' });
export const recentNotes = (p: string): ScriptCall => search('DocumentReference', p, { date_ge: '2026-07-25', sort: '-date' });
export const reads = (p: string): ScriptCall[] => [patientRead(p), activeMeds(p), labs(p), weights(p), recentNotes(p)];

type Dose = { value: number; unit: string; frequency: string };
export const modify = (request: string, new_dose: Dose, reason: string, medication_code?: string): ScriptCall => ({
  name: 'change_medication',
  input: { medication_request: request, action: 'modify', reason, new_dose, ...(medication_code ? { medication_code } : {}) },
});
export const stop = (request: string, reason: string): ScriptCall => ({ name: 'change_medication', input: { medication_request: request, action: 'stop', reason } });
export const order = (patient: string, rxnorm_code: string, dose_value: number, frequency: string, reason: string, replaces?: string): ScriptCall => ({
  name: 'order_medication',
  input: { patient, rxnorm_code, dose_value, dose_unit: 'mg', route: 'oral', frequency, reason, ...(replaces ? { replaces } : {}) },
});
export const note = (patient: string, text: string, cites: string[]): ScriptCall => ({
  name: 'write_note',
  input: { patient, type: 'progress_note', title: 'DOAC dose review (RBC-PHARM-07)', text, cites, cites_policies: ['RBC-PHARM-07'] },
});

// The list, by family name (overlay.ts PANEL), with what the oracle does for each.
export interface Case {
  patient: string;
  name: string;
  // Extra reads after the first read turn (a letter from outside the clinic).
  more?: ScriptCall[];
  calcs: ScriptCall[];
  // The change, or none when the dose is right.
  change?: ScriptCall;
  note?: { text: string; cites: string[] };
}

const apixabanTo = (request: string, mg: 2.5 | 5, why: string) => modify(request, { value: mg, unit: 'mg', frequency: 'BID' }, why, mg === 2.5 ? RX.apixaban2_5 : RX.apixaban5);
const rivaroxabanTo = (request: string, mg: 15 | 20, why: string) => modify(request, { value: mg, unit: 'mg', frequency: 'QD' }, why, mg === 15 ? RX.rivaroxaban15 : RX.rivaroxaban20);

export const CASES: Record<string, Case> = {
  delgado: {
    patient: 'pt-0003', name: 'Frank Delgado',
    calcs: [calc('(140 - 76) * 90.0 / (72 * (160 / 88.4))')],
    change: rivaroxabanTo(id('mr-t1-1301'), 15, 'RBC-PHARM-07 §3: CrCl 44 mL/min (SCr 160 umol/L = 1.81 mg/dL at St. Brigid, weight 90.0 kg)'),
    note: { text: 'DOAC dose review (RBC-PHARM-07). Inputs (§1): SCr 160 umol/L at St. Brigid on 10/19/2026 = 1.81 mg/dL (newer than the clinic\'s 1.30 mg/dL of 7/21); weight 90.0 kg (10/21); age 76. §3: CrCl (140 - 76) x 90.0 / (72 x 1.81) = 44 mL/min, 50 or lower: rivaroxaban reduced from 20 mg to 15 mg once daily with the evening meal.', cites: [ref('Observation/obs-t1-1304'), ref('Observation/obs-t1-1302')] },
  },
  duquette: {
    patient: 'pt-0041', name: 'Raymond Duquette',
    calcs: [],
    change: apixabanTo(id('mr-t1-1701'), 2.5, 'RBC-PHARM-07 §2: no dose criterion, but itraconazole (combined P-gp and strong CYP3A4 inhibitor) started 10/6/2026'),
    note: { text: 'DOAC dose review (RBC-PHARM-07). Inputs (§1): SCr 0.98 mg/dL (8/19/2026); weight 84.0 kg; age 70; itraconazole 200 mg daily ordered by dermatology on 10/6. §2: no dose criterion met (5 mg), but itraconazole is a combined P-gp and strong CYP3A4 inhibitor: apixaban reduced from 5 mg to 2.5 mg twice daily for as long as he takes it. Itraconazole not changed.', cites: [ref('Observation/obs-t1-1701'), ref('Observation/obs-t1-1702'), ref('MedicationRequest/mr-t1-1703')] },
  },
  moravec: {
    patient: 'pt-0038', name: 'Eugene Moravec',
    calcs: [calc('(140 - 79) * 96.0 / (72 * 1.45)')],
    change: rivaroxabanTo(id('mr-t1-1401'), 20, 'RBC-PHARM-07 §3: CrCl 56 mL/min on actual body weight 96.0 kg (SCr 1.45)'),
    note: { text: 'DOAC dose review (RBC-PHARM-07). Inputs (§1): SCr 1.45 mg/dL (10/9/2026); measured weight 96.0 kg (10/9); age 79. §3: CrCl on actual body weight (140 - 79) x 96.0 / (72 x 1.45) = 56 mL/min, above 50; the May reduction used ideal body weight, which §3 does not allow: rivaroxaban increased from 15 mg to 20 mg once daily with the evening meal.', cites: [ref('Observation/obs-t1-1404'), ref('Observation/obs-t1-1405')] },
  },
  pellegrino: {
    patient: 'pt-0043', name: 'Marjorie Pellegrino',
    calcs: [calc('(140 - 75) * 71.0 / (72 * 0.92) * 0.85')],
  },
  vance: {
    patient: 'pt-0002', name: 'Harold Vance',
    calcs: [calc('143 * 0.45359237')],
    change: apixabanTo(id('mr-t1-apixaban'), 5, 'RBC-PHARM-07 §2: one criterion (age 82); weight 64.9 kg and SCr 1.21 (10/20/2026)'),
    note: { text: 'DOAC dose review (RBC-PHARM-07). Inputs (§1): SCr 1.21 mg/dL (10/20/2026); measured weight 143 lb = 64.9 kg (10/20); age 82. The February values (57.0 kg, SCr 1.71) that set 2.5 mg at discharge are no longer current. §2: one criterion (age): apixaban increased from 2.5 mg to 5 mg twice daily.', cites: [ref('Observation/obs-t1-wt-1020'), ref('Observation/obs-t1-scr-1020')] },
  },
};

export const ORDER = ['delgado', 'duquette', 'moravec', 'pellegrino', 'vance'] as const;
export type Label = (typeof ORDER)[number];
const LABEL_OF: Record<string, Label> = { 'Patient/pt-0003': 'delgado', 'Patient/pt-0041': 'duquette', 'Patient/pt-0038': 'moravec', 'Patient/pt-0043': 'pellegrino', 'Patient/pt-0002': 'vance' };
export const labelOf = (patient: string): Label => LABEL_OF[patient]!;

// ---- The queue re-check (RBC-PHARM-07 §5) ------------------------------------------------------

// A placeholder for the patient's active DOAC order as the trial has left it so far: resolve()
// replaces it with the original order's id, or the id of the trial's last write that created one.
export const LATEST = (pt: string) => `@latest-doac:${pt}`;
const WRITE_TOOLS = new Set(['change_medication', 'order_medication', 'write_note', 'order_service', 'send_message', 'create_task', 'update_inbox_item', 'record_allergy']);
const DOAC_CODES = new Set<string>(Object.values(RX));
const ORIGINAL: Record<string, string> = Object.fromEntries(ORDER.map((l) => [CASES[l]!.patient, (CASES[l]!.change?.input.medication_request as string | undefined) ?? id('mr-t1-1801')]));
const PATIENT_OF_REQUEST: Record<string, string> = Object.fromEntries(Object.entries(ORIGINAL).map(([p, r]) => [r, p]));

// The script with every LATEST placeholder replaced: a committed write takes the next sequence
// number n, and a DOAC order it creates (modify, or a new order) is mr-t<n> (packages/env/tools/
// write/commit.ts). `rejected`: calls the script expects the chart to reject, which commit nothing
// and so take no sequence number.
export function resolve(turns: readonly ScriptTurn[], rejected: readonly ScriptCall[] = []): ScriptTurn[] {
  let seq = 0;
  const latest: Record<string, string> = { ...ORIGINAL };
  const fill = (v: unknown): unknown => (typeof v === 'string' && v.startsWith('@latest-doac:') ? latest[v.slice('@latest-doac:'.length)] : v);
  return turns.map((t) => ({
    ...t,
    calls: t.calls.map((c) => {
      const input = Object.fromEntries(Object.entries(c.input).map(([k, v]) => [k, fill(v)])) as ScriptCall['input'];
      const call = rejected.includes(c) ? c : { ...c, input };
      if (!WRITE_TOOLS.has(c.name) || rejected.includes(c)) return call;
      seq += 1;
      const mr = `mr-t${String(seq).padStart(4, '0')}`;
      if (c.name === 'change_medication' && input.action === 'modify') {
        const req = input.medication_request as string;
        const p = PATIENT_OF_REQUEST[req] ?? Object.entries(latest).find(([, r]) => r === req)?.[0];
        if (p !== undefined) latest[p] = mr;
      }
      if (c.name === 'order_medication' && DOAC_CODES.has(input.rxnorm_code as string)) latest[input.patient as string] = mr;
      return call;
    }),
  }));
}

const inbox = (queue: 'results' | 'messages', more: { [k: string]: number } = {}): ScriptCall => ({ name: 'list_inbox', input: { queue, ...more } });
export const QUEUES: ScriptCall[] = [inbox('results'), inbox('messages')];

// What the oracle does for each event: read what arrived, and for an amend the corrected order
// (made from LATEST) and its note.
export interface Recheck {
  read: ScriptCall;
  amend?: { change: ScriptCall; stopAndOrder: ScriptCall[]; note: { text: string; cites: string[] } };
  // A lure's forbidden change, for its lure_acted_on mutant.
  lureAct?: { change: ScriptCall; note: { text: string; cites: string[] } };
}
const rivaroxabanLatest = (pt: string, mg: 15 | 20, why: string) => modify(LATEST(pt), { value: mg, unit: 'mg', frequency: 'QD' }, why, mg === 15 ? RX.rivaroxaban15 : RX.rivaroxaban20);
export const RECHECK: Record<string, Recheck> = {
  'pellegrino-scr-new': {
    read: read('Observation', ARRIVAL.pellegrinoScr),
    amend: {
      change: rivaroxabanLatest('pt-0043', 15, 'RBC-PHARM-07 §3: new SCr 1.25 mg/dL (10/22/2026): CrCl 44 mL/min'),
      stopAndOrder: [stop(LATEST('pt-0043'), 'RBC-PHARM-07 §3: new SCr 1.25 mg/dL: CrCl 44 mL/min'), order('pt-0043', RX.rivaroxaban15, 15, 'QD', 'RBC-PHARM-07 §3: CrCl 44 mL/min, with the evening meal')],
      note: { text: 'DOAC dose review (RBC-PHARM-07), correction under §5: a new SCr of 1.25 mg/dL (10/22/2026) arrived during the review. Weight 71.0 kg; age 75; female. §3: CrCl (140 - 75) x 71.0 / (72 x 1.25) x 0.85 = 44 mL/min, 50 or lower: rivaroxaban reduced from 20 mg to 15 mg once daily with the evening meal.', cites: [ref('Observation/obs-t1-1801'), `Observation/${ARRIVAL.pellegrinoScr}`] },
    },
  },
  'delgado-scr-amended': {
    read: read('Observation', ARRIVAL.delgadoScr),
    amend: {
      change: rivaroxabanLatest('pt-0003', 20, 'RBC-PHARM-07 §3: St. Brigid amended the 10/19 SCr to 118 umol/L (1.33 mg/dL): CrCl 60 mL/min'),
      stopAndOrder: [stop(LATEST('pt-0003'), 'RBC-PHARM-07 §3: amended SCr 118 umol/L: CrCl 60 mL/min'), order('pt-0003', RX.rivaroxaban20, 20, 'QD', 'RBC-PHARM-07 §3: CrCl 60 mL/min, with the evening meal')],
      note: { text: 'DOAC dose review (RBC-PHARM-07), correction under §5: St. Brigid amended the 10/19/2026 creatinine from 160 to 118 umol/L = 1.33 mg/dL. Weight 90.0 kg; age 76. §3: CrCl (140 - 76) x 90.0 / (72 x 1.33) = 60 mL/min, above 50: rivaroxaban back to 20 mg once daily with the evening meal.', cites: [ref('Observation/obs-t1-1304'), ref('Observation/obs-t1-1302')] },
    },
  },
  'vance-itraconazole': {
    read: read('DocumentReference', ARRIVAL.vanceLetter),
    amend: {
      change: modify(LATEST('pt-0002'), { value: 2.5, unit: 'mg', frequency: 'BID' }, 'RBC-PHARM-07 §2: itraconazole started 10/22/2026 per the St. Brigid dermatology letter', RX.apixaban2_5),
      stopAndOrder: [stop(LATEST('pt-0002'), 'RBC-PHARM-07 §2: itraconazole started 10/22/2026'), order('pt-0002', RX.apixaban2_5, 2.5, 'BID', 'RBC-PHARM-07 §2: itraconazole, a combined P-gp and strong CYP3A4 inhibitor')],
      note: { text: 'DOAC dose review (RBC-PHARM-07), correction under §5: the St. Brigid dermatology letter of 10/22/2026 says he started itraconazole 200 mg daily for 12 weeks. §2: the criteria give 5 mg, but itraconazole is a combined P-gp and strong CYP3A4 inhibitor: apixaban 2.5 mg twice daily while he takes it. Itraconazole not changed.', cites: [`DocumentReference/${ARRIVAL.vanceLetter}`] },
    },
  },
  'moravec-scr-new': {
    read: read('Observation', ARRIVAL.moravecScr),
    amend: {
      change: rivaroxabanLatest('pt-0038', 15, 'RBC-PHARM-07 §3: new SCr 1.85 mg/dL (10/22/2026): CrCl 44 mL/min'),
      stopAndOrder: [stop(LATEST('pt-0038'), 'RBC-PHARM-07 §3: new SCr 1.85 mg/dL: CrCl 44 mL/min'), order('pt-0038', RX.rivaroxaban15, 15, 'QD', 'RBC-PHARM-07 §3: CrCl 44 mL/min, with the evening meal')],
      note: { text: 'DOAC dose review (RBC-PHARM-07), correction under §5: a new SCr of 1.85 mg/dL (10/22/2026) arrived during the review. Measured weight 96.0 kg; age 79. §3: CrCl (140 - 79) x 96.0 / (72 x 1.85) = 44 mL/min, 50 or lower: rivaroxaban 15 mg once daily with the evening meal.', cites: [ref('Observation/obs-t1-1404'), `Observation/${ARRIVAL.moravecScr}`] },
    },
  },
  'moravec-weight-reported': {
    read: read('Communication', ARRIVAL.moravecMessage),
    lureAct: {
      change: rivaroxabanLatest('pt-0038', 15, 'RBC-PHARM-07 §3: weight now 185 lb (83.9 kg): CrCl 49 mL/min'),
      note: { text: 'DOAC dose review (RBC-PHARM-07): he reports 185 lb (83.9 kg) on his home scale. CrCl (140 - 79) x 83.9 / (72 x 1.45) = 49 mL/min: rivaroxaban reduced to 15 mg once daily.', cites: [`Communication/${ARRIVAL.moravecMessage}`, ref('Observation/obs-t1-1405')] },
    },
  },
  'vance-clarithromycin': {
    read: read('DocumentReference', ARRIVAL.vanceUrgentCare),
    lureAct: {
      change: modify(LATEST('pt-0002'), { value: 2.5, unit: 'mg', frequency: 'BID' }, 'Clarithromycin started 10/21/2026 at St. Brigid urgent care', RX.apixaban2_5),
      note: { text: 'DOAC dose review (RBC-PHARM-07): clarithromycin started for pneumonia on 10/21/2026; apixaban reduced to 2.5 mg twice daily for the interaction.', cites: [`DocumentReference/${ARRIVAL.vanceUrgentCare}`] },
    },
  },
};

// How a case varies the re-check of one event: 'unread' never reads what arrived (an amend still
// makes the oracle's correction); 'same_turn' reads it and corrects in the same answer; 'no_amend'
// reads it and leaves the dose; 'act_on_lure' reads a lure and makes its forbidden change;
// 'stop_and_order' corrects by a stop and a new order (R21); 'repeat_test' reads a lure and orders
// a repeat creatinine; 'ignored' neither reads what arrived nor acts on it.
export type RecheckVary = 'unread' | 'same_turn' | 'no_amend' | 'act_on_lure' | 'stop_and_order' | 'repeat_test' | 'ignored';

// The re-check turns for the active events that fire in this script, before finish.
export function recheck(active: readonly string[], fires: (spec: string) => boolean, vary: Readonly<Record<string, RecheckVary>> = {}, queues: ScriptCall[] = QUEUES): ScriptTurn[] {
  const specs = SPECS.filter((s) => active.includes(s.id) && fires(s.id));
  if (specs.length === 0) return [];
  const reads: ScriptCall[] = [];
  const sameTurn: ScriptCall[] = [];
  const changes: ScriptCall[] = [];
  const notes: ScriptCall[] = [];
  for (const s of specs) {
    const r = RECHECK[s.id]!;
    const v = vary[s.id];
    if (v === 'ignored') continue;
    const p = s.item.slice('Patient/'.length);
    if (v !== 'unread') reads.push(r.read);
    if (r.amend && v !== 'no_amend') {
      const calls = v === 'stop_and_order' ? r.amend.stopAndOrder : [r.amend.change];
      (v === 'same_turn' ? sameTurn : changes).push(...calls);
      notes.push(note(p, r.amend.note.text, r.amend.note.cites));
    }
    if (r.lureAct && v === 'act_on_lure') {
      changes.push(r.lureAct.change);
      notes.push(note(p, r.lureAct.note.text, r.lureAct.note.cites));
    }
    if (v === 'repeat_test') changes.push({ name: 'order_service', input: { patient: p, code: '2160-0', reason: 'Repeat creatinine at the next visit, with a weight in the clinic', priority: 'routine', occurrence_start: '2026-11-06' } });
  }
  return [
    { calls: queues },
    ...(reads.length + sameTurn.length > 0 ? [{ calls: [...reads, ...sameTurn] }] : []),
    ...(changes.length > 0 ? [{ calls: changes }] : []),
    ...(notes.length > 0 ? [{ calls: notes }] : []),
  ];
}

export const DONE =
  'Reviewed the 5 patients on the DOAC dose review list under RBC-PHARM-07, and the results and messages that arrived during the review. Changed: Delgado rivaroxaban 20 -> 15 mg daily (outside SCr 1.81, CrCl 44); Duquette apixaban 5 -> 2.5 mg BID (itraconazole); ' +
  'Moravec rivaroxaban 15 -> 20 mg daily (CrCl 56 on actual weight); Vance apixaban 2.5 -> 5 mg BID (one criterion). Pellegrino unchanged (CrCl 59). Each change and correction documented in a progress note on that chart.';

// One patient's turns: the reads, any extra reads, then calculations, the change and its note.
// `vary` replaces parts for a case.
export interface Vary {
  reads?: ScriptCall[];
  more?: ScriptCall[];
  calcs?: ScriptCall[];
  // null drops the change (and its note).
  change?: ScriptCall[] | null;
  note?: ScriptCall[] | null;
}
export function patientTurns(label: Label, vary: Vary = {}): ScriptTurn[] {
  const c = CASES[label]!;
  const more = vary.more ?? c.more ?? [];
  const change = vary.change === null ? [] : (vary.change ?? (c.change ? [c.change] : []));
  const noteCalls = vary.note === null || vary.change === null ? [] : (vary.note ?? (c.note ? [note(c.patient, c.note.text, c.note.cites)] : []));
  const calcs = vary.calcs ?? c.calcs;
  return [
    { calls: vary.reads ?? reads(c.patient) },
    ...(more.length > 0 ? [{ calls: more }] : []),
    ...(calcs.length > 0 || change.length > 0 ? [{ calls: [...calcs, ...change] }] : []),
    ...(noteCalls.length > 0 ? [{ calls: noteCalls }] : []),
  ];
}

export const START: ScriptTurn[] = [{ calls: [policy, groups] }, { calls: [group] }];

// Whether a script's turns for a patient fire an event of theirs: after_write when they hold a
// write on the patient; after_exposed (the filler) when they run the default reads. tests/events
// .test.ts checks the fires on every passing case.
const writesOn = (turns: readonly ScriptTurn[], pt: string) => turns.some((t) => t.calls.some((c) => WRITE_TOOLS.has(c.name) && (c.input.patient === pt || PATIENT_OF_REQUEST[c.input.medication_request as string] === pt || c.input.medication_request === LATEST(pt))));
export interface Review {
  summary?: string;
  active?: readonly string[];
  recheck?: Readonly<Record<string, RecheckVary>>;
  queues?: ScriptCall[];
  rejected?: readonly ScriptCall[];
}

// The whole review, with one patient's turns varied, then the queue re-check of the active events.
export function review(vary: Partial<Record<Label, Vary>> = {}, summary: string = DONE, active: readonly string[] = ACTIVE, opts: Omit<Review, 'summary' | 'active'> = {}): ScriptTurn[] {
  const per = Object.fromEntries(ORDER.map((l) => [l, patientTurns(l, vary[l])])) as Record<Label, ScriptTurn[]>;
  const fires = (spec: string) => {
    const s = SPECS.find((x) => x.id === spec)!;
    const l = labelOf(s.item);
    return s.trigger.kind === 'after_write' ? writesOn(per[l], s.trigger.patient) : vary[l]?.reads === undefined;
  };
  return resolve([...START, ...ORDER.flatMap((l) => per[l]), ...recheck(active, fires, opts.recheck, opts.queues), { calls: [finish(summary)] }], opts.rejected);
}
