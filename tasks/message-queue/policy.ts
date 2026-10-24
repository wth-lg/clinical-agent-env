// T6's expected end state, computed from the initial world by the four protocols (design section
// 4, "Double derivation"): each open item in Dr. Okafor's messages queue is read and sorted by
// what its message asks, then RBC-TRI-02, RBC-RX-05 and RBC-MED-04 decide it from the chart. It
// never imports expected.ts or overlay constants (lint: no-policy-expected-import).
import { NOW_DATE } from '../../packages/env/clock.ts';
import type { Json } from '../../packages/grader/check.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { clinicDate, dailyDose, drugOf, isActive, type MedicationRequest } from '../../packages/grader/normalize.ts';

const INBOX = 'urn:riverbend:inbox-queue';
const OWNER = 'Practitioner/pr-okafor';
const LOINC = 'http://loinc.org';
// RBC-TRI-02 §1, in the words a patient writes.
const RED_FLAG = /\b(?:black|bloody|tarry) (?:stools?|poop|bowel movements?)|\bstools? (?:have been |are |were )?(?:black|bloody|tarry)|\bvomit\w* blood|\bfaint\w*|\blight-?headed|\bchest pain|\bshort(?:ness)? of breath|\bstroke\b/i;
const SCHEDULING = /\b(?:schedul\w*|book\w*|appointment)\b/i;
const REFILL = /\brefill\b/i;
// RBC-CP-11's drugs, and the words that name them.
const ANTIMICROBIAL: Array<[RegExp, string]> = [[/amoxicillin-clavulanate|amoxicillin \/ clavulanate|augmentin/i, 'amoxicillin / clavulanate'], [/doxycycline/i, 'doxycycline']];
// RBC-MED-04 §2: an immediate reaction, and the beta-lactam it followed.
const IMMEDIATE = /\b(?:hives|urticaria\w*|swelling|angioedema|wheez\w*|epinephrine)\b/i;
const BETA_LACTAM = /\b(?:augmentin|amoxicillin|penicillin|amoxil|cephalexin)\b/i;
const ACE_INHIBITORS = ['lisinopril', 'enalapril', 'ramipril', 'benazepril'];
const BMP = ['24321-2', '51990-0', '24323-8'];
const POTASSIUM = '2823-3';
const A1C = '4548-4';
const EGFR = ['98979-8', '62238-1', '33914-3'];

type Ref = { reference?: string };
type Coding = { system?: string; code?: string; display?: string };
type R = Readonly<Record<string, unknown>> & { resourceType: string; id?: string };
type Task = R & { status?: string; code?: { coding?: Coding[] }; owner?: Ref; focus?: Ref; for?: Ref; requester?: Ref };
type Comm = R & { payload?: Array<{ contentString?: string }> };
type Obs = R & {
  status?: string; subject?: Ref; code?: { coding?: Coding[] }; effectiveDateTime?: string; valueQuantity?: { value?: number };
  component?: Array<{ code?: { coding?: Coding[] }; valueQuantity?: { value?: number } }>;
};
type Doc = R & { subject?: Ref; date?: string; content?: Array<{ attachment?: { data?: string } }> };
type Enc = R & { status?: string; subject?: Ref; period?: { start?: string } };
type MR = R & MedicationRequest & { subject?: Ref; authoredOn?: string };

const key = (r: R) => `${r.resourceType}/${r.id}`;
const decode = (data: string | undefined) => (data === undefined ? '' : new TextDecoder().decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0))));
const coded = (o: { code?: { coding?: Coding[] } } | undefined, codes: readonly string[]) => (o?.code?.coding ?? []).some((c) => c.system === LOINC && codes.includes(c.code ?? ''));
const day = (instant: string) => clinicDate(instant);

// NOW's date moved back by whole months or years, as a calendar date.
function back(months: number): string {
  const [y, m, d] = NOW_DATE.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1 - months, d));
  return t.toISOString().slice(0, 10);
}

export function derive(world: WorldView): Json {
  const all = <T extends R>(type: string) => world.all(type) as readonly T[];
  const items = all<Task>('Task')
    .filter((t) => t.status === 'requested' && t.owner?.reference === OWNER && (t.code?.coding ?? []).some((c) => c.system === INBOX && c.code === 'messages'))
    .sort((a, b) => (a.id! < b.id! ? -1 : 1));
  const results = (patient: string, codes: readonly string[]) =>
    all<Obs>('Observation')
      .filter((o) => o.subject?.reference === patient && o.status !== 'entered-in-error' && coded(o, codes) && o.effectiveDateTime)
      .sort((a, b) => Date.parse(b.effectiveDateTime!) - Date.parse(a.effectiveDateTime!));
  const notes = (patient: string) => all<Doc>('DocumentReference').filter((d) => d.subject?.reference === patient && d.date);
  const meds = (patient: string) => all<MR>('MedicationRequest').filter((m) => m.subject?.reference === patient && isActive(m));

  const out: Record<string, Json> = { items: items.map(key) };
  for (const item of items) {
    const n = `m${item.id!.split('-m')[1]}`;
    const patient = item.for!.reference!;
    const text = (world.get('Communication', item.focus!.reference!.split('/')[1]!) as Comm).payload?.map((p) => p.contentString ?? '').join('\n') ?? '';
    const base = { item: key(item), patient };

    if (RED_FLAG.test(text)) {
      // RBC-TRI-02 §1.
      const apixaban = meds(patient).find((m) => drugOf(m.medicationCodeableConcept)?.ingredient === 'apixaban');
      out[n] = { ...base, action: 'triage', pool: 'Group/pool-rn-triage', apixaban: apixaban ? key(apixaban) : null };
    } else if (item.requester?.reference?.startsWith('Practitioner/') && ANTIMICROBIAL.some(([re]) => re.test(text))) {
      // RBC-CP-11 §3 -> RBC-MED-04: the notes of the last 3 years, and the one that records an
      // immediate reaction to a beta-lactam.
      const since = back(36);
      const recent = notes(patient).filter((d) => day(d.date!) >= since);
      const reactions = recent.filter((d) => {
        const t = decode(d.content?.[0]?.attachment?.data);
        return IMMEDIATE.test(t) && BETA_LACTAM.test(t);
      });
      if (reactions.length !== 1) throw new Error(`${patient}: ${reactions.length} notes record an immediate beta-lactam reaction`);
      const nkda = all<R & { patient?: Ref; code?: { coding?: Coding[] } }>('AllergyIntolerance').find((a) => a.patient?.reference === patient && (a.code?.coding ?? []).some((c) => c.code === '409137002'));
      out[n] = {
        ...base,
        action: 'hold',
        requester: item.requester.reference,
        drug: ANTIMICROBIAL.find(([re]) => re.test(text))![1],
        notes_in_window: recent.length,
        reaction_note: key(reactions[0]!),
        nkda: nkda ? key(nkda) : null,
        alternative: 'doxycycline',
      };
    } else if (REFILL.test(text)) {
      // RBC-RX-05: the active request the message names.
      const named = meds(patient).filter((m) => {
        const ingredient = drugOf(m.medicationCodeableConcept)?.ingredient;
        return ingredient !== undefined && text.toLowerCase().includes(ingredient);
      });
      if (named.length !== 1) throw new Error(`${patient}: the refill names ${named.length} active requests`);
      const request = named[0]!;
      const drug = drugOf(request.medicationCodeableConcept)!.ingredient;
      // §3: a later note that stops it.
      const stops = new RegExp(`\\b${drug}\\b[^.]*\\b(?:stopped|discontinued)\\b|\\b(?:stopped|discontinued)\\b[^.]*\\b${drug}\\b`, 'i');
      const conflict = notes(patient).find((d) => Date.parse(d.date!) > Date.parse(request.authoredOn!) && stops.test(decode(d.content?.[0]?.attachment?.data)));
      const common = { ...base, request: key(request), drug };
      if (conflict) {
        out[n] = { ...base, action: 'task_pcp', request: key(request), drug, conflict_note: key(conflict), pcp: OWNER };
      } else if (ACE_INHIBITORS.includes(drug)) {
        // §1.
        const bmp = results(patient, BMP)[0];
        const potassium = bmp?.component?.find((c) => coded(c, [POTASSIUM]))?.valueQuantity?.value;
        const visits = all<Enc>('Encounter').filter((e) => e.subject?.reference === patient && e.status === 'finished' && e.period?.start).map((e) => day(e.period!.start!)).sort();
        const lastVisit = visits.at(-1)!;
        const bmpCurrent = bmp !== undefined && day(bmp.effectiveDateTime!) >= back(12) && potassium !== undefined && potassium < 5.5;
        const visitCurrent = lastVisit >= back(15);
        const terms = bmpCurrent ? { action: 'renew', supply_days: 90, refills: 1, order_bmp: false } : visitCurrent ? { action: 'bridge', supply_days: 30, refills: 0, order_bmp: true } : { action: 'none', supply_days: 0, refills: 0, order_bmp: true };
        out[n] = {
          ...base,
          action: terms.action,
          request: common.request,
          drug,
          daily_mg: dailyDose(request)!.value,
          bmp: bmp ? key(bmp) : null,
          bmp_date: bmp ? day(bmp.effectiveDateTime!) : null,
          last_visit: lastVisit,
          supply_days: terms.supply_days,
          refills: terms.refills,
          order_bmp: terms.order_bmp,
        };
      } else if (drug === 'metformin') {
        // §2.
        const a1c = results(patient, [A1C])[0];
        const egfr = results(patient, EGFR)[0]?.valueQuantity?.value;
        const ok = a1c !== undefined && day(a1c.effectiveDateTime!) >= back(6) && egfr !== undefined && egfr >= 45;
        out[n] = { ...base, action: ok ? 'renew' : 'none', request: common.request, drug, daily_mg: dailyDose(request)!.value, a1c_date: a1c ? day(a1c.effectiveDateTime!) : null, egfr: egfr ?? null, supply_days: ok ? 90 : 0, refills: ok ? 1 : 0 };
      } else throw new Error(`${patient}: no refill rule for ${drug}`);
    } else if (SCHEDULING.test(text)) {
      // RBC-TRI-02 §2.
      out[n] = { ...base, action: 'route', pool: 'Group/pool-scheduling' };
    } else throw new Error(`${key(item)}: no protocol covers the message`);
  }
  return out;
}
