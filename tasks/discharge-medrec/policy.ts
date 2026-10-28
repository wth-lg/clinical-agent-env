// T4's expected end state, computed from the initial world by RBC-TOC-02 (design section 4,
// "Double derivation"): the patient the instruction names, the discharge documents of his latest
// hospital stay (§1: the latest signed addendum over the summary), each discharge medication line
// read for its action, the conditional resume checked against the latest valid creatinine after
// discharge (§2), the formulary substitution (§3), aliases (§4: a line and a chart order name
// the same drug when normalize.ts reads them as the same ingredient), and the home medications no
// line addresses (§5). It never imports expected.ts or overlay constants (lint:
// no-policy-expected-import).
import type { Json } from '../../packages/grader/check.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { dailyDose, drugOf, type MedicationRequest } from '../../packages/grader/normalize.ts';

const NAME = { given: 'Walter', family: 'Kim' };
const LOINC = 'http://loinc.org';
const SCR = '2160-0';
// A result a clinician may act on: final, or final and later amended or corrected.
const VALID = new Set(['final', 'amended', 'corrected']);

type R = Readonly<Record<string, unknown>> & { resourceType: string; id?: string };
type Doc = R & { date?: string; status?: string; docStatus?: string; type?: { coding?: Array<{ code?: string }> }; relatesTo?: Array<{ code?: string; target?: { reference?: string } }>; context?: { encounter?: Array<{ reference?: string }> }; content?: Array<{ attachment?: { data?: string } }> };
type Med = R & MedicationRequest & { status?: string; subject?: { reference?: string } };

const textOf = (d: Doc) => (d.content ?? []).map((c) => new TextDecoder().decode(Uint8Array.from(atob(c.attachment?.data ?? ''), (ch) => ch.charCodeAt(0)))).join('\n');
// The ingredient a chart order or a document's drug name means (§4: an alias reads as its drug).
const ingredient = (name: string | Med['medicationCodeableConcept']) => drugOf(name)?.ingredient ?? '';
// A document line or correction names its drug before its strength or its first colon.
const named = (line: string) => ingredient(line.replace(/^Correction:\s*/i, '').split(/:| \d/)[0]!);
const ref = (r: R) => `${r.resourceType}/${r.id}`;

export function derive(world: WorldView): Json {
  const patient = (world.all('Patient') as ReadonlyArray<R & { name?: Array<{ given?: string[]; family?: string }> }>).find((p) => (p.name ?? []).some((n) => n.family === NAME.family && n.given?.[0] === NAME.given));
  if (!patient) throw new Error('no patient Walter Kim');
  const pt = `Patient/${patient.id}`;

  // §1: discharge summaries of the latest stay; an appending signed addendum overrides lines.
  const docs = (world.all('DocumentReference') as readonly Doc[]).filter((d) => (d as { subject?: { reference?: string } }).subject?.reference === pt && d.status === 'current' && (d.type?.coding ?? []).some((c) => c.code === '18842-5'));
  const summaries = docs.filter((d) => !(d.relatesTo ?? []).some((x) => x.code === 'appends')).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const summary = summaries[0]!;
  const addenda = docs.filter((d) => d.docStatus === 'final' && (d.relatesTo ?? []).some((x) => x.code === 'appends' && x.target?.reference === ref(summary))).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  const addendum = addenda[0];
  const discharged = summary.date!;

  const lines = textOf(summary).split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
  const corrections = addendum ? textOf(addendum).split('\n').filter((l) => /^Correction:/.test(l)) : [];
  const mgOf = (line: string) => Number(/(\d+(?:\.\d+)?) mg/.exec(line)?.[1] ?? NaN);

  // Latest valid creatinine after discharge (§2).
  const scrs = (world.all('Observation') as ReadonlyArray<R & { status?: string; subject?: { reference?: string }; code?: { coding?: Array<{ system?: string; code?: string }> }; effectiveDateTime?: string; valueQuantity?: { value?: number } }>)
    .filter((o) => o.subject?.reference === pt && VALID.has(o.status ?? '') && (o.code?.coding ?? []).some((c) => c.system === LOINC && c.code === SCR) && (o.effectiveDateTime ?? '') > discharged)
    .sort((a, b) => (b.effectiveDateTime ?? '').localeCompare(a.effectiveDateTime ?? ''));
  const scr = scrs[0]!;

  const meds = (world.all('MedicationRequest') as readonly Med[]).filter((m) => m.subject?.reference === pt && (m.status === 'active' || m.status === 'on-hold'));
  const chart = (drug: string) => meds.filter((m) => ingredient(m.medicationCodeableConcept) === drug);
  const one = (drug: string) => {
    const found = chart(drug);
    if (found.length !== 1) throw new Error(`${found.length} ${drug} orders`);
    return found[0]!;
  };

  // The corrected line's drug and dose, the text an order on it must have been shown.
  const correction = corrections[0] ? corrections[0].replace(/^Correction:\s*/i, '').split(',')[0]!.trim().toLowerCase() : null;
  const out: Record<string, Json> = {};
  const unchanged: string[] = [];
  const notOrdered: string[] = [];
  const addressed = new Set<string>();
  // The summary line each change comes from, unless a correction rules that drug (§1).
  const ruling: Record<string, string> = {};
  for (const line of lines) {
    const drug = named(line);
    addressed.add(drug);
    const fix = corrections.find((c) => named(c) === drug);
    const from = () => { if (!fix) ruling[drug.replace(' ', '_')] = line; };
    const mg = fix ? mgOf(fix) : mgOf(line);
    const sub = /formulary substitution for home (\w+)/i.exec(line);
    if (sub) {
      // §3: keep the home drug, order nothing.
      notOrdered.push(drug);
      const home = ingredient(sub[1]!);
      addressed.add(home);
      unchanged.push(ref(one(home)));
    } else if (/:\s*stop\b/i.test(line)) {
      out[drug.replace(' ', '_')] = { request: ref(one(drug)), action: 'stop' };
      from();
    } else if (/resume home (\d+) mg daily when SCr < (\d+(?:\.\d+)?)/i.test(line)) {
      const [, dose, limit] = /resume home (\d+) mg daily when SCr < (\d+(?:\.\d+)?)/i.exec(line)!;
      const value = scr.valueQuantity!.value!;
      out.scr = { id: ref(scr), mg_dl: value, threshold: Number(limit) };
      out[drug] = { request: ref(one(drug)), action: value < Number(limit) ? 'resume' : 'task', daily_mg: Number(dose), per_day: 1 };
      from();
    } else if (/:\s*start\b/i.test(line)) {
      out[drug] = { request: chart(drug)[0] ? ref(chart(drug)[0]!) : null, action: 'start', daily_mg: mg, per_day: 1 };
      from();
    } else if (/:\s*continue\b/i.test(line)) {
      const m = one(drug);
      if (dailyDose(m)?.value !== mg && !Number.isNaN(mg)) throw new Error(`${drug}: continue at ${mg} mg but the chart has ${dailyDose(m)?.value}`);
      unchanged.push(ref(m));
    } else if (/increased from/i.test(line)) {
      out[drug] = { request: ref(one(drug)), action: 'modify', daily_mg: mg, per_day: 1 };
      from();
    } else throw new Error(`unread discharge line: ${line}`);
  }
  // §5: active home medications no line addresses stay as they are, and the PCP hears of them.
  const unaddressed = meds.filter((m) => m.status === 'active' && !addressed.has(ingredient(m.medicationCodeableConcept)));
  unchanged.push(...unaddressed.map(ref));

  return {
    patient: pt,
    sources: { summary: ref(summary), addendum: addendum ? ref(addendum) : null, correction, lines: ruling, ignored: summaries.slice(1).map(ref) },
    scr: out.scr!,
    furosemide: out.furosemide!,
    spironolactone: out.spironolactone!,
    potassium_chloride: out.potassium_chloride!,
    lisinopril: out.lisinopril!,
    unchanged: unchanged.sort(),
    not_ordered: notOrdered,
    message_about: unaddressed.map(ref),
    cites: [addendum ? ref(addendum) : ref(summary), ref(scr)],
  };
}
