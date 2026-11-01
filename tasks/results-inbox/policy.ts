// T2's expected end state, computed from the initial world by the policies (design section 4,
// "Double derivation"): every open item in the results queue, classified from its focus and the
// patient's record by RBC-INBOX-01 §2, RBC-LAB-03, RBC-RAD-05 and RBC-GI-01. It never imports
// expected.ts or overlay constants (lint: no-policy-expected-import). Items come out in ORDER, which
// expected.ts follows.
import { NOW_DATE } from '../../packages/env/clock.ts';
import { noteText } from '../../packages/env/tools/read/notes.ts';
import type { Json } from '../../packages/grader/check.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { clinicDate } from '../../packages/grader/normalize.ts';

const INBOX = 'urn:riverbend:inbox-queue';
const LOINC = 'http://loinc.org';
const K = '2823-3';
const CREATININE = ['2160-0', '38483-4'];
const FIT = '29771-3';
const TSH = '3016-3';
// The statuses of a valid result: one that is not withdrawn and not preliminary.
const VALID = ['final', 'corrected', 'amended'];
const CORRECTED = ['corrected', 'amended'];

const ORDER = ['nodule_overdue', 'nodule_scheduled', 'hemolyzed_report', 'hemolyzed_note', 'corrected_up', 'corrected_down', 'eie_result', 'eie_baseline', 'prelim_positive', 'prelim_negative', 'aki_48h', 'aki_7day', 'normal_tsh'];

type Ref = { reference?: string };
type Coded = { coding?: Array<{ system?: string; code?: string; display?: string }> };
type R = Readonly<Record<string, unknown>> & { resourceType: string; id?: string };
type Item = R & { status?: string; code?: Coded; focus?: Ref; for?: Ref };
type Obs = R & { status?: string; code?: Coded; subject?: Ref; effectiveDateTime?: string; valueQuantity?: { value?: number }; valueCodeableConcept?: Coded; interpretation?: Coded[]; note?: Array<{ text?: string }> };
type Report = R & { status?: string; code?: Coded; subject?: Ref; effectiveDateTime?: string; issued?: string; result?: Ref[]; conclusion?: string };

const key = (r: R) => `${r.resourceType}/${r.id}`;
const hasCode = (c: Coded | undefined, ...codes: string[]) => (c?.coding ?? []).some((x) => x.system === LOINC && codes.includes(x.code ?? ''));
const normal = (o: Obs) => (o.interpretation ?? []).every((i) => (i.coding ?? []).every((c) => c.code === 'N'));
const notes = (o: Obs) => (o.note ?? []).map((n) => n.text ?? '').join(' ');

function get(world: WorldView, ref: string | undefined): R | undefined {
  const [type, id] = (ref ?? '').split('/');
  return type && id ? (world.get(type, id) as R | undefined) : undefined;
}

// YYYY-MM-DD plus whole months or days, on the calendar.
function plusMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}
const plusDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
function nextBusinessDay(date: string): string {
  let d = plusDays(date, 1);
  while ([0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay())) d = plusDays(d, 1);
  return d;
}

// RBC-RAD-05 §2's exception: the patient's most recent lung cancer screening report that states a
// Lung-RADS category and the interval to the next screening study, if any (by study date, then id).
function screening(world: WorldView, patient: string): { report: string; index: string; lung_rads: number; months: number } | undefined {
  const reports = (world.all('DiagnosticReport') as readonly Report[])
    .filter((r) => r.subject?.reference === patient && r.effectiveDateTime !== undefined)
    .sort((a, b) => b.effectiveDateTime!.localeCompare(a.effectiveDateTime!) || (a.id! < b.id! ? -1 : 1));
  for (const r of reports) {
    const text = noteText(r as never) ?? '';
    const category = /Lung-RADS\s+(\d)/.exec(text);
    const interval = /screening\b[^.]*\bin (\d+) months/i.exec(text);
    if (/lung cancer screening/i.test(text) && category && interval) return { report: key(r), index: clinicDate(r.effectiveDateTime!), lung_rads: Number(category[1]), months: Number(interval[1]) };
  }
  return undefined;
}

// RBC-INBOX-01 §2(c): the final version of a preliminary report, the same study (patient, code and
// time) reported later with a valid status.
function finalOf(world: WorldView, prelim: Report): Report | undefined {
  const code = (r: Report) => (r.code?.coding ?? []).map((c) => `${c.system}|${c.code}`).join(',');
  return (world.all('DiagnosticReport') as readonly Report[])
    .filter((r) => r !== prelim && VALID.includes(r.status ?? '') && r.subject?.reference === prelim.subject?.reference && code(r) === code(prelim) && r.effectiveDateTime === prelim.effectiveDateTime)
    .sort((a, b) => (b.issued ?? '').localeCompare(a.issued ?? ''))[0];
}

// RBC-LAB-03 §3 over the patient's creatinines collected before `at`: the valid ones (RBC-INBOX-01
// §2(b)), or the withdrawn ones. Returns the comparison value that meets the rule, if any: a value
// in the 48 hours before that is 0.3 or more lower, else the lowest in the 7 days before when the
// result is 1.5 times it or more.
const HOUR = 3_600_000;
// The patient's creatinines, valid or withdrawn, collected in the `hours` before `at`, lowest first
// (then by id).
function priorCreatinines(world: WorldView, patient: string, at: string, withdrawn: boolean, hours: number): Obs[] {
  const t = Date.parse(at);
  return (world.all('Observation') as readonly Obs[])
    .filter((o) => o.subject?.reference === patient && hasCode(o.code, ...CREATININE) && o.valueQuantity?.value !== undefined && o.effectiveDateTime !== undefined)
    .filter((o) => (withdrawn ? o.status === 'entered-in-error' : VALID.includes(o.status ?? '')))
    .filter((o) => Date.parse(o.effectiveDateTime!) < t && t - Date.parse(o.effectiveDateTime!) <= hours * HOUR)
    .sort((a, b) => a.valueQuantity!.value! - b.valueQuantity!.value! || (a.id! < b.id! ? -1 : 1));
}
function akiRule(world: WorldView, patient: string, at: string, value: number, withdrawn: boolean): { rule: '48h' | '7d'; obs: Obs } | undefined {
  const rise = priorCreatinines(world, patient, at, withdrawn, 48).find((o) => Math.round((value - o.valueQuantity!.value!) * 100) >= 30);
  if (rise) return { rule: '48h', obs: rise };
  const low = priorCreatinines(world, patient, at, withdrawn, 24 * 7)[0];
  if (low && value >= 1.5 * low.valueQuantity!.value!) return { rule: '7d', obs: low };
  return undefined;
}
// R31: the 7-day window §3 compares a creatinine collected at `at` with, as ISO instants, and its
// lowest valid creatinine, which stands for the window's review (expected.ts WithdrawnItem).
function baselineOf(world: WorldView, patient: string, at: string): { id: string; from: string; to: string } {
  const low = priorCreatinines(world, patient, at, false, 24 * 7)[0];
  if (!low) throw new Error(`${patient}: no valid creatinine in the 7 days before ${at}`);
  const t = Date.parse(at);
  return { id: key(low), from: new Date(t - 24 * 7 * HOUR).toISOString(), to: new Date(t).toISOString() };
}

export function derive(world: WorldView): Json {
  const tasks = (world.all('Task') as readonly Item[]).filter((t) => t.status === 'requested' && (t.code?.coding ?? []).some((c) => c.system === INBOX && c.code === 'results'));
  const out: Record<string, Json> = {};
  const put = (k: string, v: Record<string, Json>) => {
    if (k in out) throw new Error(`two items classified ${k}`);
    out[k] = { key: k, ...v };
  };
  for (const t of tasks) {
    const focus = get(world, t.focus?.reference);
    const patient = t.for?.reference ?? '';
    if (!focus) throw new Error(`${key(t)}: no focus`);
    const base = { task: key(t), patient };

    if (focus.resourceType === 'Observation') {
      const o = focus as Obs;
      if (o.status === 'entered-in-error') {
        // §2(b): no action; a positive FIT that stood would need a GI referral (RBC-GI-01 §1).
        if (!hasCode(o.code, FIT)) throw new Error(`${key(o)}: withdrawn result not classified`);
        put('eie_result', { class: 'entered_in_error', ...base, sources: [key(o)], withdrawn: key(o), forbid: 'gi', action: 'close' });
      } else if (hasCode(o.code, K) && CORRECTED.includes(o.status ?? '')) {
        corrected(o, base);
      } else if (hasCode(o.code, TSH) && normal(o)) {
        put('normal_tsh', { class: 'filler', ...base, sources: [key(o)], action: 'close' });
      } else throw new Error(`${key(t)}: result not classified`);
      continue;
    }
    if (focus.resourceType !== 'DiagnosticReport') throw new Error(`${key(t)}: focus ${key(focus)} not classified`);
    const report = focus as Report;
    const text = noteText(report as never);

    if (report.status === 'preliminary') {
      // §2(c): act on the final report.
      const final = finalOf(world, report);
      if (!final) throw new Error(`${key(report)}: no final report`);
      const words = noteText(final as never) ?? '';
      const date = clinicDate(final.issued!);
      // R1: the final report decides; the preliminary read cannot change the action.
      const sources = [key(final)];
      if (/recommend urgent/i.test(words) && !/\bin \d+ (?:days?|weeks?|months?)\b/i.test(words)) {
        // RBC-RAD-05 §3: within 14 days of the report date.
        put('prelim_positive', { class: 'preliminary', ...base, sources, final: key(final), report_date: date, by: plusDays(date, 14), action: 'order' });
      } else if (/no pulmonary nodule/i.test(words) && /no follow-up/i.test(words)) {
        put('prelim_negative', { class: 'preliminary', ...base, sources, final: key(final), report_date: date, action: 'close' });
      } else throw new Error(`${key(final)}: final report not classified`);
      continue;
    }

    if (text !== undefined) {
      const nodule = /(\d+)\s*mm solid nodule/i.exec(text);
      if (!nodule) throw new Error(`${key(report)}: report not classified`);
      if (Number(nodule[1]) >= 6) throw new Error(`${key(report)}: a ${nodule[1]} mm nodule is outside RBC-RAD-05 §2`);
      // §2's exception with §1: the next screening study on the last screening report's schedule,
      // from that study, window plus or minus 1 month; once that window has passed, within 14 days.
      const screen = screening(world, patient);
      if (!screen) throw new Error(`${patient}: a nodule outside lung cancer screening is not in this probe`);
      const due = plusMonths(screen.index, screen.months);
      const overdue = plusMonths(due, 1) < NOW_DATE;
      put(overdue ? 'nodule_overdue' : 'nodule_scheduled', {
        class: 'nodule_screening',
        ...base,
        sources: [key(report), screen.report],
        nodule_mm: Number(nodule[1]),
        index_date: clinicDate(report.effectiveDateTime!),
        screening_index: screen.index,
        lung_rads: screen.lung_rads,
        overdue,
        window: overdue ? { start: NOW_DATE, end: plusDays(NOW_DATE, 14) } : { start: plusMonths(due, -1), end: plusMonths(due, 1) },
        action: 'order',
      });
      continue;
    }

    // A lab panel: its potassium, then its creatinine.
    const members = (report.result ?? []).map((r) => get(world, r.reference) as Obs | undefined).filter((o): o is Obs => o !== undefined);
    const k = members.find((o) => hasCode(o.code, K));
    const cr = members.find((o) => hasCode(o.code, ...CREATININE));
    if (k && CORRECTED.includes(k.status ?? '')) {
      corrected(k, base);
    } else if (k && (k.valueQuantity?.value ?? 0) >= 6) {
      // RBC-LAB-03: only a hemolyzed potassium is in this probe; the flag on the result or on its report.
      const onResult = /hemoly/i.test(notes(k));
      const onReport = /hemoly/i.test(report.conclusion ?? '');
      if (!onResult && !onReport) throw new Error(`${key(k)}: a potassium of 6.0 or higher that is not hemolyzed is not in this probe`);
      put(onResult ? 'hemolyzed_note' : 'hemolyzed_report', { class: 'hemolyzed', ...base, sources: onResult ? [key(k)] : [key(report), key(k)], k: k.valueQuantity!.value!, by: nextBusinessDay(NOW_DATE), action: 'order' });
    } else if (cr) {
      const value = cr.valueQuantity!.value!;
      const aki = akiRule(world, patient, cr.effectiveDateTime!, value, false);
      if (aki) {
        put(aki.rule === '48h' ? 'aki_48h' : 'aki_7day', { class: 'aki', ...base, sources: [key(cr), key(aki.obs)], creatinine: value, compare: key(aki.obs), compare_value: aki.obs.valueQuantity!.value!, rule: aki.rule, by: nextBusinessDay(NOW_DATE), action: 'order' });
      } else {
        // §2(b): a withdrawn value that would have met the rule.
        const void_ = akiRule(world, patient, cr.effectiveDateTime!, value, true);
        if (!void_) throw new Error(`${key(cr)}: creatinine not classified`);
        const baseline = baselineOf(world, patient, cr.effectiveDateTime!);
        put('eie_baseline', { class: 'entered_in_error', ...base, sources: [key(cr), key(void_.obs), baseline.id], withdrawn: key(void_.obs), forbid: 'creatinine', action: 'close', baseline });
      }
    } else throw new Error(`${key(t)}: panel not classified`);
  }

  // RBC-INBOX-01 §2(a): the corrected potassium, with RBC-LAB-03 §1 (not hemolyzed) or §4 of the
  // inbox policy (normal: close).
  function corrected(k: Obs, base: { task: string; patient: string }) {
    const first = /first reported as (\d+(?:\.\d+)?)/i.exec(notes(k));
    if (!first) throw new Error(`${key(k)}: corrected result without the value first reported`);
    const value = k.valueQuantity!.value!;
    if (value >= 6 && /hemoly/i.test(notes(k).replace(/not hemolyzed/gi, ''))) throw new Error(`${key(k)}: a hemolyzed corrected potassium is not in this probe`);
    if (value >= 6) put('corrected_up', { class: 'corrected', ...base, sources: [key(k)], reported: Number(first[1]), k: value, by: NOW_DATE, action: 'order' });
    else if (normal(k)) put('corrected_down', { class: 'corrected', ...base, sources: [key(k)], reported: Number(first[1]), k: value, action: 'close' });
    else throw new Error(`${key(k)}: corrected potassium not classified`);
  }

  const missing = ORDER.filter((k) => !(k in out));
  if (missing.length > 0) throw new Error(`no item classified ${missing.join(', ')}`);
  if (Object.keys(out).length !== ORDER.length) throw new Error(`items outside the probe: ${Object.keys(out).filter((k) => !ORDER.includes(k)).join(', ')}`);
  return { queue: 'results', items: ORDER.map((k) => out[k]!) };
}
