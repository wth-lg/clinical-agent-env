// T6's expected end state, computed from the initial world by RBC-RX-05 (design section 4, "Double
// derivation"): each open item in Dr. Okafor's messages queue is a refill request for one of the
// patient's active orders, decided on the chart's valid results by §1-§5. It never imports
// expected.ts or overlay constants (lint: no-policy-expected-import).
import { NOW_DATE } from '../../packages/env/clock.ts';
import type { Json } from '../../packages/grader/check.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { clinicDate, dailyDose, drugOf, isActive, type MedicationRequest } from '../../packages/grader/normalize.ts';

const INBOX = 'urn:riverbend:inbox-queue';
const OWNER = 'Practitioner/pr-okafor';
const LOINC = 'http://loinc.org';
const ACE_INHIBITORS = ['lisinopril', 'enalapril', 'ramipril', 'benazepril'];
// §1: a BMP panel under either of its codes, or a comprehensive panel, which contains one.
const BMP_PANELS = ['51990-0', '24321-2', '24323-8'];
const POTASSIUM = ['2823-3', '6298-4'];
const CREATININE = ['2160-0', '38483-4'];
const EGFR = ['33914-3', '98979-8', '62238-1'];
const A1C = ['4548-4'];
const LAB_REPORT = '11502-2';
// §1: a hemolyzed specimen, in a result's note or a report's comment.
const HEMOLYZED = /\bhemoly[sz]ed\b|\bhaemoly[sz]ed\b/i;

type Ref = { reference?: string };
type Coding = { system?: string; code?: string };
type R = Readonly<Record<string, unknown>> & { resourceType: string; id?: string };
type Task = R & { status?: string; code?: { coding?: Coding[] }; owner?: Ref; focus?: Ref; for?: Ref };
type Comm = R & { sent?: string; payload?: Array<{ contentString?: string }> };
type Obs = R & { status?: string; subject?: Ref; code?: { coding?: Coding[] }; effectiveDateTime?: string; valueQuantity?: { value?: number }; note?: Array<{ text?: string }> };
type DR = R & { subject?: Ref; code?: { coding?: Coding[] }; effectiveDateTime?: string; result?: Ref[] };
type Doc = R & { subject?: Ref; type?: { coding?: Coding[] }; content?: Array<{ attachment?: { data?: string } }> };
type Enc = R & { status?: string; subject?: Ref; period?: { start?: string } };
type MR = R & MedicationRequest & { subject?: Ref; authoredOn?: string; status?: string };

// One result, from the clinic or an outside report: its collection instant and value.
interface Result { at: number; day: string; value: number; hemolyzed: boolean }

const key = (r: R) => `${r.resourceType}/${r.id}`;
const decode = (data: string | undefined) => (data === undefined ? '' : new TextDecoder().decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0))));
const coded = (o: { code?: { coding?: Coding[] } } | undefined, codes: readonly string[]) => (o?.code?.coding ?? []).some((c) => c.system === LOINC && codes.includes(c.code ?? ''));

// NOW's date moved back by whole months, as a calendar date.
function back(months: number): string {
  const [y, m, d] = NOW_DATE.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1 - months, d)).toISOString().slice(0, 10);
}
// A scanned report's collection time: "Collected: MM/DD/YYYY HH:MM" (clinic time, EDT/EST as the
// date falls; only the date and order matter here).
function collected(text: string): { at: number; day: string } | null {
  const m = /Collected:\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(text);
  if (!m) return null;
  const day = `${m[3]}-${m[1]}-${m[2]}`;
  return { at: Date.parse(`${day}T${m[4]}:${m[5]}:00-04:00`), day };
}
const row = (text: string, re: RegExp) => {
  const m = re.exec(text);
  return m ? Number(m[1]) : null;
};

export function derive(world: WorldView): Json {
  const all = <T extends R>(type: string) => world.all(type) as readonly T[];
  const items = all<Task>('Task')
    .filter((t) => t.status === 'requested' && t.owner?.reference === OWNER && (t.code?.coding ?? []).some((c) => c.system === INBOX && c.code === 'messages'))
    .sort((a, b) => (a.id! < b.id! ? -1 : 1));
  const messageOf = (t: Task) => world.get('Communication', t.focus!.reference!.split('/')[1]!) as Comm;
  const textOf = (c: Comm) => (c.payload ?? []).map((p) => p.contentString ?? '').join('\n');

  // §1: the patient's results of a kind, newest first, from Observations (an entered-in-error one is
  // not a result; an amended one carries its corrected value) and from scanned laboratory reports.
  const reports = (patient: string) =>
    all<Doc>('DocumentReference')
      .filter((d) => d.subject?.reference === patient && (d.type?.coding ?? []).some((c) => c.system === LOINC && c.code === LAB_REPORT))
      .flatMap((d) => {
        const text = decode(d.content?.[0]?.attachment?.data);
        const when = collected(text);
        return when ? [{ ...when, text }] : [];
      });
  const observed = (patient: string, codes: readonly string[]): Result[] =>
    all<Obs>('Observation')
      .filter((o) => o.subject?.reference === patient && o.status !== 'entered-in-error' && coded(o, codes) && o.effectiveDateTime && o.valueQuantity?.value !== undefined)
      .map((o) => ({ at: Date.parse(o.effectiveDateTime!), day: clinicDate(o.effectiveDateTime!), value: o.valueQuantity!.value!, hemolyzed: (o.note ?? []).some((n) => HEMOLYZED.test(n.text ?? '')) }));
  const fromReports = (patient: string, re: RegExp, hemolysisCounts: boolean): Result[] =>
    reports(patient).flatMap((r) => {
      const value = row(r.text, re);
      return value === null ? [] : [{ at: r.at, day: r.day, value, hemolyzed: hemolysisCounts && HEMOLYZED.test(r.text) }];
    });
  const newest = (rs: Result[]) => [...rs].sort((a, b) => b.at - a.at);
  const potassium = (p: string) => newest([...observed(p, POTASSIUM), ...fromReports(p, /^Potassium\s+(\d+(?:\.\d+)?)/m, true)]);
  const creatinine = (p: string) => newest([...observed(p, CREATININE), ...fromReports(p, /^Creatinine\s+(\d+(?:\.\d+)?)/m, false)]);
  const egfr = (p: string) => newest([...observed(p, EGFR), ...fromReports(p, /^eGFR(?: \([^)]*\))?\s+(\d+(?:\.\d+)?)/m, false)]);
  const a1c = (p: string) => newest([...observed(p, A1C), ...fromReports(p, /\(HbA1c\)\s+(\d+(?:\.\d+)?)/, false)]);
  // A BMP is a panel report in the clinic or a scanned report of one; valid when its potassium is.
  const bmps = (p: string): Result[] => {
    const panels = all<DR>('DiagnosticReport')
      .filter((d) => d.subject?.reference === p && coded(d, BMP_PANELS) && d.effectiveDateTime)
      .flatMap((d) => {
        const k = (d.result ?? []).map((x) => world.get('Observation', x.reference!.split('/')[1]!) as Obs | undefined).find((o) => o && o.status !== 'entered-in-error' && coded(o, POTASSIUM));
        return k ? [{ at: Date.parse(d.effectiveDateTime!), day: clinicDate(d.effectiveDateTime!), value: k.valueQuantity!.value!, hemolyzed: (k.note ?? []).some((n) => HEMOLYZED.test(n.text ?? '')) }] : [];
      });
    const scanned = reports(p).filter((r) => /\bBasic metabolic panel\b/i.test(r.text)).flatMap((r) => {
      const k = row(r.text, /^Potassium\s+(\d+(?:\.\d+)?)/m);
      return k === null ? [] : [{ at: r.at, day: r.day, value: k, hemolyzed: HEMOLYZED.test(r.text) }];
    });
    return newest([...panels, ...scanned]);
  };
  const lastVisit = (p: string) =>
    all<Enc>('Encounter').filter((e) => e.subject?.reference === p && e.status === 'finished' && e.period?.start).map((e) => clinicDate(e.period!.start!)).sort().at(-1) ?? null;

  // The item each message asks about: the patient's active order whose ingredient it names.
  const asked = items.map((t) => {
    const patient = t.for!.reference!;
    const c = messageOf(t);
    const text = textOf(c).toLowerCase();
    const named = all<MR>('MedicationRequest').filter((m) => m.subject?.reference === patient && isActive(m) && text.includes(drugOf(m.medicationCodeableConcept)?.ingredient ?? '\u0000'));
    if (named.length !== 1) throw new Error(`${key(t)}: the message names ${named.length} active orders`);
    return { t, patient, sent: Date.parse(c.sent!), request: named[0]! };
  });

  const out = asked.map(({ t, patient, sent, request }) => {
    const drug = drugOf(request.medicationCodeableConcept)!.ingredient;
    const base = { item: key(t), patient, drug, request: key(request) };
    const none = { daily_mg: null, supply_days: null, refills: null, lab: null, duplicate_of: null };
    // §5: an earlier message for the same request.
    const first = asked.filter((a) => a.patient === patient && key(a.request) === key(request) && a.sent < sent).sort((a, b) => a.sent - b.sent)[0];
    if (first) return { ...base, action: 'duplicate', ...none, duplicate_of: key(first.t) };
    const mg = dailyDose(request)!.value;
    const renew = (lab: string | null = null) => ({ ...base, action: 'renew', daily_mg: mg, supply_days: 90, refills: 1, lab, duplicate_of: null });
    const bridge = (lab: string) => ({ ...base, action: 'bridge', daily_mg: mg, supply_days: 30, refills: 0, lab, duplicate_of: null });
    const hold = { ...base, action: 'hold', ...none };
    const visitCurrent = (lastVisit(patient) ?? '') >= back(15);

    if (ACE_INHIBITORS.includes(drug)) {
      // §2: the most recent valid potassium decides, from a BMP or measured on its own (a standalone
      // Observation or a scanned report's row); renewing also needs a valid BMP of the last 12 months,
      // by collection date, which a potassium on its own is not.
      const k = potassium(patient);
      const validK = k.find((r) => !r.hemolyzed);
      const current = bmps(patient).some((b) => !b.hemolyzed && b.day >= back(12));
      // A start or dose increase: this order, after an earlier one of the drug at a lower daily dose.
      const authored = Date.parse(request.authoredOn!);
      const raised = all<MR>('MedicationRequest').some((m) => m.subject?.reference === patient && m !== request && drugOf(m.medicationCodeableConcept)?.ingredient === drug && Date.parse(m.authoredOn!) < authored && (dailyDose(m)?.value ?? Infinity) < mg);
      const cr = creatinine(patient);
      const before = cr.find((r) => r.at <= authored);
      const after = cr.filter((r) => r.at > authored && r.at - authored <= 28 * 86_400_000)[0];
      const rise = raised && before !== undefined && after !== undefined && after.value > before.value * 1.3;
      if (rise || (validK !== undefined && validK.value >= 5.5)) return hold;
      if (current) return renew(k[0]?.hemolyzed ? 'bmp' : null);
      if (visitCurrent) return bridge('bmp');
      throw new Error(`${key(t)}: no BMP in 12 months and no visit in 15`);
    }
    if (drug === 'metformin') {
      // §3.
      const e = egfr(patient)[0];
      if (e === undefined) throw new Error(`${key(t)}: no eGFR`);
      if (e.value < 45) return hold;
      return a1c(patient).some((r) => r.day >= back(6)) ? renew() : bridge('hba1c');
    }
    // §4.
    if (visitCurrent) return renew();
    throw new Error(`${key(t)}: no visit in 15 months`);
  });
  return { items: out };
}
