// T4's expected end state, computed from the initial world by RBC-TOC-02 (design section 4,
// "Double derivation"; plan-amendment-worklist W1 T4 probe): for each patient the instruction
// names, the discharge documents of the latest stay (§1: the latest signed addendum over the
// summary), each discharge line read for its action, the drug names (§4: a brand, a generic or a
// release-form name of the same ingredient is the same drug), formulary substitutions (§3), the
// conditional resume against the latest valid creatinine after discharge (§2) and the potassium
// rule (§7: the latest potassium after discharge above 5.0 holds a start or resume), and the
// pharmacy fill history (§5: a filled drug with no clinic order and no discharge line is flagged; a
// home order the fill history lists whose fills cover under 80% of the 180 days before admission,
// or of the days since its first fill when that falls inside them, is flagged). It never
// imports expected.ts, ids.ts or overlay constants (lint: no-policy-expected-import).
// W5-E (plan-amendment-w5): a conditional resume whose condition names post-discharge results and
// whose chart holds no result after discharge is not met (§2's sentence): keep the order held and
// create a Task due when the line says the result is expected ('defer'); the record that stands
// for the review of the patient's results after discharge is the stay's last creatinine (R31: a
// complete search of the window, tests/grader.ts). A dose line for a drug the fill histories list
// is decided by the line and those histories (R1: §5(b) would block the change), and is a flag
// when its coverage, counted from the first fill when that falls inside the window, is under 80%.
import type { Json } from '../../packages/grader/check.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { clinicDate, dailyDose, drugOf, type MedicationRequest } from '../../packages/grader/normalize.ts';
import { LEVER } from './lever.ts';

// The worklist, in the instruction's order: the three base patients, the A host (every state), and
// the B and reserve hosts while their item is active (lever.ts).
const NAMES: ReadonlyArray<[given: string, family: string]> = [
  ['Walter', 'Kim'], ['Terence', 'Stark'], ['Earnest', 'Roberts'], ['Gerald', 'Whitcomb'],
  ...(LEVER.includes('B') ? [['Lorraine', 'Pruitt'] as [string, string]] : []),
  ...(LEVER.includes('reserve') ? [['Victor', 'Salazar'] as [string, string]] : []),
];
// Brand names a discharge line may use that normalize.ts does not map (§4).
const BRANDS: Record<string, string> = { coreg: 'carvedilol', 'procardia xl': 'nifedipine', procardia: 'nifedipine', synthroid: 'levothyroxine', protonix: 'pantoprazole', crestor: 'rosuvastatin' };

const LOINC = 'http://loinc.org';
const SUMMARY = '18842-5';
const LAB_REPORT = '11502-2';
const FILL_HISTORY = '10160-0';
const SCR = '2160-0';
const K = '2823-3';
const REPORT_SCR = /^Creatinine\s+(\d+(?:\.\d+)?) mg\/dL/m;
const REPORT_K = /^Potassium\s+(\d+(?:\.\d+)?) mmol\/L/m;
// §7: the potassium above which no potassium-raising drug is started or resumed, and the drugs.
const K_LIMIT = 5.0;
const RAISES_K = /^(?:spironolactone|eplerenone|finerenone|\w+pril|\w+sartan|potassium \w+)$/;
// §5: the window and the share of it the fills must cover.
const WINDOW_DAYS = 180;
const COVERED = 0.8;
const VALID = new Set(['final', 'amended', 'corrected']);
// §1: a signed addendum: final, or amended or corrected after signing; a preliminary draft is not one.
const SIGNED = VALID;
const DAY = 86_400_000;

type R = Readonly<Record<string, unknown>> & { resourceType: string; id?: string };
type Doc = R & { subject?: { reference?: string }; date?: string; status?: string; docStatus?: string; type?: { coding?: Array<{ system?: string; code?: string }> }; relatesTo?: Array<{ code?: string; target?: { reference?: string } }>; context?: { encounter?: Array<{ reference?: string }> }; content?: Array<{ attachment?: { data?: string } }> };
type Med = R & MedicationRequest & { status?: string; subject?: { reference?: string } };
type Enc = R & { period?: { start?: string; end?: string } };

const textOf = (d: Doc) => (d.content ?? []).map((c) => new TextDecoder().decode(Uint8Array.from(atob(c.attachment?.data ?? ''), (ch) => ch.charCodeAt(0)))).join('\n');
const ref = (r: R) => `${r.resourceType}/${r.id}`;
const isType = (d: Doc, code: string) => (d.type?.coding ?? []).some((c) => c.system === LOINC && c.code === code);
// The ingredient a name means: a brand from BRANDS, else normalize.ts.
const ingredient = (name: string | Med['medicationCodeableConcept']): string => {
  if (typeof name === 'string') {
    const brand = BRANDS[name.trim().toLowerCase()];
    if (brand !== undefined) return brand;
  }
  return drugOf(name)?.ingredient ?? '';
};
// A line names its drug before its strength or its first colon.
const nameIn = (line: string) => line.replace(/^Correction:\s*/i, '').split(/:| \d/)[0]!.trim();
// The atoms of a line (R29): the minimal facts that decide its item, in the line's order, without
// the drug's name, which the patient and the line already fix. A dose line's are its strength and
// the frequency words perDayOf reads when the line has them (a line without them is read as once
// daily); a stop line's is 'stop'; a conditional resume's are 'Resume' and its creatinine
// condition ('on post-discharge labs' only says where to look, which §2 already says).
const doseAtoms = (line: string) => {
  const m = /(\d+(?:\.\d+)? mg)\b(?:.*?\b(twice daily|three times daily|with meals)\b)?/i.exec(line);
  return m ? [m[1]!, ...(m[2] ? [m[2]] : [])] : [line];
};
const STOP = /:\s*(stop)\b/i;
const RESUME = /(resume) home (\d+) mg daily when (SCr < (\d+(?:\.\d+)?))/i;
// §2: when the line says the result is expected ('BMP 3 days after discharge').
const EXPECTED_IN = /(\d+) days after discharge/i;
const perDayOf = (line: string) => (/\btwice daily\b/i.test(line) ? 2 : /\bthree times daily\b|\bwith meals\b/i.test(line) ? 3 : 1);
const mgOf = (line: string) => Number(/(\d+(?:\.\d+)?) mg\b/.exec(line)?.[1] ?? NaN);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function derive(world: WorldView): Json {
  const docsOf = (pt: string) => (world.all('DocumentReference') as readonly Doc[]).filter((d) => d.subject?.reference === pt && d.status === 'current');
  const patients: Json[] = [];
  const items: Json[] = [];

  for (const [given, family] of NAMES) {
    const patient = (world.all('Patient') as ReadonlyArray<R & { name?: Array<{ given?: string[]; family?: string }> }>).find((p) => (p.name ?? []).some((n) => n.family === family && n.given?.[0] === given));
    if (!patient) throw new Error(`no patient ${given} ${family}`);
    const pt = `Patient/${patient.id}`;
    const docs = docsOf(pt);

    // §1: the latest discharge summary, the stay it closes, and the latest signed addendum to it.
    const summaries = docs.filter((d) => isType(d, SUMMARY) && !(d.relatesTo ?? []).some((x) => x.code === 'appends')).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    const summary = summaries[0];
    if (!summary) throw new Error(`${given} ${family}: no discharge summary`);
    const stay = world.get('Encounter', (summary.context?.encounter?.[0]?.reference ?? '').split('/')[1] ?? '') as Enc | undefined;
    const discharged = Date.parse(stay?.period?.end ?? summary.date ?? '');
    const addendum = docs.filter((d) => isType(d, SUMMARY) && SIGNED.has(d.docStatus ?? '') && (d.relatesTo ?? []).some((x) => x.code === 'appends' && x.target?.reference === ref(summary))).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];
    // §5: every fill history filed for the patient (the clinic pharmacy's, and other pharmacies').
    const fillDocs = docs.filter((d) => isType(d, FILL_HISTORY)).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

    const summaryText = textOf(summary);
    const lines = summaryText.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
    const corrections = addendum ? textOf(addendum).split('\n').filter((l) => /^Correction:/.test(l)) : [];
    // §3: substitute ingredient -> the home ingredient and the clause's atoms: the substitute's name
    // as the summary writes it and the words that mark it as given in place of the home drug.
    const substitutions = new Map([...summaryText.matchAll(/formulary substitution[^:]*:\s*(\w+) \d+ mg[^.]*?((?:in place of|for) home) (\w+)\b/gi)].map((m): [string, { home: string; atoms: string[] }] => [ingredient(m[1]!), { home: ingredient(m[3]!), atoms: [m[1]!, m[2]!] }]));

    // §2 and §7: the valid results after discharge, newest first, each an Observation (seen when
    // exposed) or a filed report's line, whose atom is the analyte and value (R29: a snippet cut
    // before the units shows it).
    const resultsOf = (loinc: string, line: RegExp, label: string) => {
      const observed = (world.all('Observation') as ReadonlyArray<R & { status?: string; subject?: { reference?: string }; code?: { coding?: Array<{ system?: string; code?: string }> }; effectiveDateTime?: string; valueQuantity?: { value?: number } }>)
        .filter((o) => o.subject?.reference === pt && VALID.has(o.status ?? '') && (o.code?.coding ?? []).some((c) => c.system === LOINC && c.code === loinc))
        .map((o) => ({ id: ref(o), at: o.effectiveDateTime ?? '', value: o.valueQuantity!.value!, atoms: null as string[] | null }));
      const reported = docs.filter((d) => VALID.has(d.docStatus ?? '') && isType(d, LAB_REPORT)).flatMap((d) => {
        const m = line.exec(textOf(d));
        return m ? [{ id: ref(d), at: d.date ?? '', value: Number(m[1]), atoms: [`${label} ${m[1]}`] as string[] | null }] : [];
      });
      return [...observed, ...reported].filter((x) => Date.parse(x.at) > discharged).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    };
    const latest = (loinc: string, line: RegExp, label: string) => resultsOf(loinc, line, label)[0];
    const atomsOf = (r: { id: string; atoms: string[] | null }) => (r.atoms ? { [r.id]: r.atoms } : {});
    const labDoc = docs.filter((d) => isType(d, LAB_REPORT) && Date.parse(d.date ?? '') > discharged).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))[0];

    const meds = (world.all('MedicationRequest') as readonly Med[]).filter((m) => m.subject?.reference === pt && (m.status === 'active' || m.status === 'on-hold'));
    // The chart's orders of a drug a line or a fill names: the same ingredient, or for a bare class
    // name such as 'Insulin', an ingredient that contains it.
    const ordersOf = (drug: string) => meds.filter((m) => {
      const have = ingredient(m.medicationCodeableConcept);
      return have === drug || (drug !== '' && have.split(/ \/ |, /).some((part) => part.startsWith(drug)));
    });
    const one = (drug: string) => {
      const found = ordersOf(drug);
      if (found.length !== 1) throw new Error(`${given} ${family}: ${found.length} ${drug} orders`);
      return found[0]!;
    };

    // §5: the fills, the drugs they name and the share of the window each home order's fills cover.
    const fills = fillDocs.flatMap((fd) =>
      textOf(fd).split('\n').flatMap((l) => {
        const m = /^(\d\d)\/(\d\d)\/(\d{4})\s+(.+?)\s{2,}(\d+)\s+(\d+)\s{2,}/.exec(l);
        return m ? [{ at: Date.parse(`${m[3]}-${m[1]}-${m[2]}T00:00:00Z`), drug: ingredient(nameIn(m[4]!)), days: Number(m[6]), doc: ref(fd), name: m[4]!.trim() }] : [];
      }),
    );
    // The fill histories that show a drug: the records a §5 item about it rests on (R1, R15).
    const showing = (drug: string) => [...new Set(fills.filter((f) => f.drug === drug).map((f) => f.doc))];
    const admitDay = Date.parse(`${clinicDate(stay!.period!.start!)}T00:00:00Z`);
    const from = admitDay - WINDOW_DAYS * DAY;
    // §5b (CMS PDC): the days covered over the window, which starts at the first fill when that
    // falls inside the 180 days, so a drug started in the window and refilled on time is covered.
    const coverage = (drug: string) => {
      const mine = fills.filter((x) => x.drug === drug);
      const start = Math.max(from, Math.min(...mine.map((f) => f.at)));
      const days = new Set<number>();
      for (const f of mine) for (let d = 0; d < f.days; d++) days.add(f.at + d * DAY);
      return [...days].filter((d) => d >= start && d < admitDay).length / ((admitDay - start) / DAY);
    };

    const own: Json[] = [];
    const addressed = new Set<string>();
    const base = (key: string, cls: string, kind: string, drug: string, request: string | null) => ({ key: `${family.toLowerCase()}-${key}`, patient: pt, cls, kind, ingredient: drug, request });
    for (const line of lines) {
      const name = nameIn(line);
      const drug = ingredient(name);
      addressed.add(drug);
      const fix = corrections.find((c) => ingredient(nameIn(c)) === drug);
      const ruling = fix ?? line;
      // R1: a signed correction decides its drug whatever the summary's line says, so the
      // addendum alone is decisive; otherwise the summary's line is. Either way the item's atoms
      // are the ruling's (R29; a correction's follow its 'Correction:' label).
      const on = fix ? ref(addendum!) : ref(summary);
      const by = (atoms: string[]) => ({ decisive: [on], atoms: { [on]: atoms } });
      const sub = substitutions.get(drug);
      if (sub !== undefined) {
        // §3: keep the home drug, order nothing. The substitution clause decides it.
        if (fix) throw new Error(`${given} ${family}: a correction to the line of the substitute ${drug}; no rule reads it`);
        const home = sub.home;
        addressed.add(home);
        own.push({ ...base(home.split(' ')[0]!, 'formulary', 'keep', home, ref(one(home))), substitute: drug, decisive: [on], atoms: { [on]: sub.atoms } });
      } else if (STOP.test(ruling)) {
        // §7: while the most recent potassium after discharge is above 5.0, no new order of a
        // potassium-raising drug, so a stopped one may not be ordered again.
        const k = latest(K, REPORT_K, 'Potassium');
        const forbid = RAISES_K.test(drug) && k !== undefined && k.value > K_LIMIT ? { no_new_order: true } : {};
        own.push({ ...base(drug === 'potassium chloride' ? 'kcl' : drug === 'hydrochlorothiazide' ? 'hctz' : drug, fix ? 'precedence' : 'filler', 'stop', drug, ref(one(drug))), ...forbid, ...by([STOP.exec(ruling)![1]!]) });
      } else if (RESUME.test(ruling)) {
        const [, resume, dose, condition, limit] = RESUME.exec(ruling)!;
        const scrs = resultsOf(SCR, REPORT_SCR, 'Creatinine');
        const scr = scrs[0];
        const k = latest(K, REPORT_K, 'Potassium');
        const met = scr !== undefined && scr.value < Number(limit);
        const held = k !== undefined && k.value > K_LIMIT && RAISES_K.test(drug);
        const lineAtoms = [resume!, condition!];
        // A resume rests on the summary's condition, the latest potassium and a creatinine after
        // discharge that meets the condition; a §7 hold rests on the potassium alone, whatever the
        // discharge documents say (R1).
        if (!met && !held) {
          // §2: the condition, which names post-discharge labs, is not met (no result after discharge,
          // or one at or above the limit): keep the order held and create a Task due when the line
          // says the result is expected (the window: a day either side). With no result after
          // discharge the decision rests on the line and on the review of the patient's results after
          // discharge (from the discharge day), which the stay's last creatinine stands for
          // (tests/grader.ts: seen only by a complete search); with one, on the line and that result.
          const expectedIn = EXPECTED_IN.exec(ruling);
          if (!expectedIn) throw new Error(`${given} ${family}: ${drug}'s resume condition is not met and its line does not say when the result is expected`);
          const day = Date.parse(`${clinicDate(stay!.period!.end!)}T00:00:00Z`) + Number(expectedIn[1]) * DAY;
          const item = { ...base(drug, 'conditional', 'defer', drug, ref(one(drug))), due: { from: isoDay(day - DAY), to: isoDay(day + DAY) } };
          if (scr !== undefined) {
            own.push({ ...item, decisive: [on, scr.id], atoms: { [on]: lineAtoms, ...atomsOf(scr) } });
            continue;
          }
          const stayScr = (world.all('Observation') as ReadonlyArray<R & { status?: string; subject?: { reference?: string }; code?: { coding?: Array<{ system?: string; code?: string }> }; effectiveDateTime?: string }>)
            .filter((o) => o.subject?.reference === pt && VALID.has(o.status ?? '') && (o.code?.coding ?? []).some((c) => c.system === LOINC && c.code === SCR) && Date.parse(o.effectiveDateTime ?? '') <= discharged)
            .sort((a, b) => Date.parse(b.effectiveDateTime ?? '') - Date.parse(a.effectiveDateTime ?? ''))[0];
          if (!stayScr) throw new Error(`${given} ${family}: no creatinine from the stay to stand for the post-discharge review`);
          own.push({ ...item, decisive: [on, ref(stayScr)], atoms: { [on]: lineAtoms }, review: { id: ref(stayScr), since: clinicDate(stay!.period!.end!) } });
        } else if (met && !held) {
          // R14, R21: the creatinine is any result after discharge below the limit and newer than
          // every one at or above it. It is named by the first such record the item does not
          // already name; the others are its other routes. When the potassium's report is the only
          // one, that report's atoms take both result lines, in its order (a read or one snippet
          // must show both: never looser than one fact per record).
          const high = scrs.findIndex((r) => r.value >= Number(limit));
          const below = high === -1 ? scrs : scrs.slice(0, high);
          const others = below.filter((r) => k === undefined || r.id !== k.id);
          const item = { ...base(drug, 'potassium', 'resume', drug, ref(one(drug))), daily_mg: Number(dose), per_day: 1 };
          if (k === undefined) {
            // No potassium after discharge: §7 cannot hold, and the resume rests on the line and the
            // creatinine alone.
            const [first, ...rest] = others;
            own.push({ ...item, decisive: [on, first!.id], atoms: { [on]: lineAtoms, ...atomsOf(first!) }, ...(rest.length > 0 ? { also: { [first!.id]: rest.map((r) => ({ id: r.id, ...(r.atoms ? { atoms: r.atoms } : {}) })) } } : {}) });
          } else if (others.length === 0) {
            const text = textOf(world.get('DocumentReference', k!.id.split('/')[1]!) as Doc).replace(/\s+/g, ' ').toLowerCase();
            const both = [...k!.atoms!, ...scr!.atoms!].sort((a, b) => text.indexOf(a.toLowerCase()) - text.indexOf(b.toLowerCase()));
            own.push({ ...item, decisive: [on, k!.id], atoms: { [on]: lineAtoms, [k!.id]: both } });
          } else {
            const [first, ...rest] = [...others, ...below.filter((r) => r.id === k!.id)];
            own.push({
              ...item, decisive: [on, k!.id, first!.id], atoms: { [on]: lineAtoms, ...atomsOf(k!), ...atomsOf(first!) },
              ...(rest.length > 0 ? { also: { [first!.id]: rest.map((r) => ({ id: r.id, ...(r.atoms ? { atoms: r.atoms } : {}) })) } } : {}),
            });
          }
        } else {
          // §7: the most recent potassium after discharge is above 5.0, whatever the condition says.
          const day = Date.parse(`${clinicDate(k!.at)}T00:00:00Z`);
          own.push({ ...base(drug, 'potassium', 'hold', drug, ref(one(drug))), due: { from: isoDay(day + 2 * DAY), to: isoDay(day + 7 * DAY) }, decisive: [k!.id], atoms: atomsOf(k!) });
        }
      } else if (/:\s*continue\b/i.test(ruling)) {
        const m = one(drug);
        const mg = mgOf(ruling);
        if (!Number.isNaN(mg) && dailyDose(m)?.value !== mg * perDayOf(ruling)) throw new Error(`${drug}: continue at ${mg} mg but the chart has ${dailyDose(m)?.value}`);
        // §5b: a continued home order not taken as prescribed is flagged, not changed. Its fill
        // histories decide by their coverage, so each counts as seen when exposed (no atoms).
        if (fills.some((f) => f.drug === drug) && coverage(drug) < COVERED) own.push({ ...base(drug, 'fill_gap', 'flag_order', drug, ref(m)), decisive: showing(drug), atoms: {} });
      } else {
        // A dose for a drug the chart has (§4, §6): the line's dose replaces the order's. Where the
        // fill histories list the drug they decide too (R1): §5(b) blocks the change when its fills
        // cover under 80% (counted from the first fill when that falls inside the window), and the
        // drug is flagged instead.
        const m = one(drug);
        const perDay = perDayOf(ruling);
        const daily = mgOf(ruling) * perDay;
        if (dailyDose(m)?.value === daily) throw new Error(`${drug}: a line at the chart's dose without 'continue'`);
        const brand = ingredient(name) !== (drugOf(name)?.ingredient ?? '');
        const filled = fills.some((f) => f.drug === drug);
        if (filled && coverage(drug) < COVERED) {
          own.push({ ...base(drug, 'fill_gap', 'flag_order', drug, ref(m)), decisive: showing(drug), atoms: {} });
          continue;
        }
        // The coverage-window class (W5-E): a fill history that lists the drug prints a proportion of
        // days covered of its own, which §5(b)'s window from the first fill overrides.
        const printed = filled && showing(drug).some((d) => /proportion of days covered/i.test(textOf(world.get('DocumentReference', d.split('/')[1]!) as Doc)));
        const cls = fix ? 'precedence' : brand ? 'brand' : printed ? 'coverage_window' : 'filler';
        const ruled = by(doseAtoms(ruling));
        own.push({ ...base(drug, cls, 'dose', drug, ref(m)), daily_mg: daily, per_day: perDay, decisive: [...ruled.decisive, ...showing(drug)], atoms: ruled.atoms });
      }
    }
    // §5a: a home order no line addresses would be flagged; this worklist plants none.
    const unaddressed = meds.filter((m) => !addressed.has(ingredient(m.medicationCodeableConcept)) && !lines.some((l) => ordersOf(ingredient(nameIn(l))).includes(m)));
    if (unaddressed.length > 0) throw new Error(`${given} ${family}: home orders no discharge line addresses: ${unaddressed.map(ref).join(', ')}`);
    // §5a: a drug filled in the window with no clinic order that no line addresses.
    const filled = [...new Set(fills.filter((f) => f.at + f.days * DAY > from && f.at < admitDay).map((f) => f.drug))];
    for (const drug of filled.filter((d) => ordersOf(d).length === 0 && !addressed.has(d))) {
      const shown = showing(drug);
      if (shown.length !== 1) throw new Error(`${given} ${family}: ${drug} shows in ${shown.length} fill histories; its flag links one`);
      // R2, R29: the record decides only this item, and what decides it is that the drug was
      // filled, so its atom is the drug's name as filled: a snippet that shows it shows the fill.
      own.push({ ...base(drug, 'fill_history', 'flag_fill', drug, null), fills: shown[0]!, decisive: shown, atoms: { [shown[0]!]: [nameIn(fills.find((f) => f.drug === drug)!.name)] } });
    }
    items.push(...own);
    patients.push({ patient: pt, name: `${given} ${family}`, summary: ref(summary), addendum: addendum ? ref(addendum) : null, fills: fillDocs.map(ref), lab: labDoc ? ref(labDoc) : null });
  }
  return { patients, items };
}
