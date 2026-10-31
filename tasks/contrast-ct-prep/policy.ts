// T5's expected end state, computed from the initial world by RBC-RAD-07 (design section 4,
// "Double derivation"), worklist probe (builder-215): every booked CT appointment on the list's
// day, in slot order, and for each the decision the policy gives. It never imports expected.ts or
// overlay constants (lint: no-policy-expected-import).
//   §1 the active allergies to iodinated contrast, graded by the record made the day of the
//      reaction (a note of that date that names the agent), not by a later list label
//   §2/§3 mild or moderate: premedicate, the doses counted back from the slot; severe: no contrast
//   §4 age 60 or older or diabetes: a creatinine within the 30 days before the scan, not drawn
//      during acute kidney injury, else a new one; AKI is a recorded diagnosis in a note before the
//      scan whose discharge creatinine is not back at its stated baseline, or a rise of 0.3 mg/dL
//      within 48 hours or to 1.5 times within 7 days, with no later value back at baseline (§4
//      sets no time limit: the injury holds until a later creatinine is back at baseline)
//   §5 AKI, or an eGFR (CKD-EPI 2021) under 30 from the latest creatinine in the window: saline
//      1 hour before the scan
//   §6 active metformin: held for AKI or an eGFR under 30
//   §7 a CT without contrast: none of this
// For each decision, the records that decide it (W1 probe rulings R1) and every note text that
// shows a decisive record's fact (R2); expected.ts says which record decides what.
import { eastern, NOW_DATE } from '../../packages/env/clock.ts';
import type { Json } from '../../packages/grader/check.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { clinicDate, isActive, isDrug } from '../../packages/grader/normalize.ts';

// The list's day.
const DATE = '2026-10-26';
const LOINC = 'http://loinc.org';
const SNOMED = 'http://snomed.info/sct';
const SCR = '2160-0';
// Type 2, type 1 and unspecified diabetes mellitus.
const DIABETES = ['44054006', '46635009', '73211009'];
// Iodinated contrast media (§1).
const IODINATED = ['iohexol', 'iopamidol', 'iodixanol', 'ioversol', 'iopromide', 'iomeprol', 'diatrizoate', 'iothalamate'];
// The clinic's CT orderables, by the name an appointment gives its study.
const STUDIES: Record<string, { code: string; contrast: boolean }> = {
  'CT abdomen and pelvis with IV contrast': { code: 'IMG-CT-AP-WC', contrast: true },
  'CT abdomen with IV contrast': { code: 'IMG-CT-ABD-WC', contrast: true },
  'CT abdomen and pelvis without contrast': { code: 'IMG-CT-AP-WO', contrast: false },
  'CT chest without contrast': { code: 'IMG-CT-CHEST-WO', contrast: false },
  'CT sinus without contrast': { code: 'IMG-CT-SINUS-WO', contrast: false },
};
// The booking screen's line, a question asked of every patient, not a record of the condition.
const SCREEN = /Contrast screening \([^)]*\):[^\n]*/g;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SEVERITY = ['mild', 'moderate', 'severe'];

type Coding = { system?: string; code?: string; display?: string };
type R = Readonly<Record<string, unknown>> & { resourceType: string; id?: string };
type Patient = R & { birthDate?: string; gender?: string; name?: Array<{ use?: string; given?: string[]; family?: string }> };
type Appointment = R & { status?: string; start?: string; description?: string; participant?: Array<{ actor?: { reference?: string } }> };
type Allergy = R & { patient?: { reference?: string }; clinicalStatus?: { coding?: Coding[] }; verificationStatus?: { coding?: Coding[] }; code?: { coding?: Coding[]; text?: string }; onsetDateTime?: string };
type Condition = R & { subject?: { reference?: string }; clinicalStatus?: { coding?: Coding[] }; code?: { coding?: Coding[] } };
type Obs = R & { status?: string; subject?: { reference?: string }; code?: { coding?: Coding[] }; effectiveDateTime?: string; valueQuantity?: { value?: number } };
type Doc = R & { subject?: { reference?: string }; date?: string; content?: Array<{ attachment?: { data?: string } }> };
type Med = R & { subject?: { reference?: string }; status?: string; medicationCodeableConcept?: { coding?: Coding[]; text?: string } };

const key = (r: R) => `${r.resourceType}/${r.id}`;
const status = (c: { coding?: Coding[] } | undefined) => c?.coding?.[0]?.code;

function ageOn(birthDate: string, date: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number];
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

function decode(data: string | undefined): string {
  if (data === undefined) return '';
  const binary = atob(data);
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

// CKD-EPI 2021 (Inker et al., NEJM 2021), no race term: 142 x min(Scr/k, 1)^a x max(Scr/k, 1)^-1.200
// x 0.9938^age (x 1.012 for women); k 0.7 (women) or 0.9 (men), a -0.241 or -0.302.
export function ckdEpi2021(scr: number, age: number, female: boolean): number {
  const k = female ? 0.7 : 0.9;
  const a = female ? -0.241 : -0.302;
  return 142 * Math.min(scr / k, 1) ** a * Math.max(scr / k, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1);
}

export function derive(world: WorldView): Json {
  const all = <T extends R>(type: string) => world.all(type) as readonly T[];
  const of = (ref: string) => (r: R & { subject?: { reference?: string }; patient?: { reference?: string } }) => (r.subject ?? r.patient)?.reference === ref;
  const notes = all<Doc>('DocumentReference').map((d) => ({ d, text: decode(d.content?.[0]?.attachment?.data) }));

  const slots = all<Appointment>('Appointment')
    .filter((a) => a.status === 'booked' && a.start !== undefined && eastern(Date.parse(a.start)).startsWith(DATE))
    .sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!));
  if (slots.length === 0) throw new Error(`no booked appointments on ${DATE}`);

  const items = slots.map((appt) => {
    const ref = (appt.participant ?? []).map((p) => p.actor?.reference ?? '').find((r) => r.startsWith('Patient/'));
    if (!ref) throw new Error(`${key(appt)}: no patient`);
    const patient = world.get('Patient', ref.slice('Patient/'.length)) as Patient;
    const name = patient.name?.find((n) => n.use === 'official') ?? patient.name?.[0];
    const scan = Date.parse(appt.start!);
    const studyName = (appt.description ?? '').split(' (')[0]!;
    const study = STUDIES[studyName];
    if (!study) throw new Error(`${key(appt)}: no orderable for '${studyName}'`);
    const age = ageOn(patient.birthDate!, NOW_DATE);
    const female = patient.gender === 'female';
    const diabetic = all<Condition>('Condition').find((c) => of(ref)(c) && status(c.clinicalStatus) === 'active' && (c.code?.coding ?? []).some((x) => x.system === SNOMED && DIABETES.includes(x.code ?? '')));
    const diabetes = diabetic !== undefined;

    // §1-§3: the contrast reaction, graded by the record of its day.
    const contrastAllergies = all<Allergy>('AllergyIntolerance').filter(
      (a) => of(ref)(a) && status(a.clinicalStatus) === 'active' && !['refuted', 'entered-in-error'].includes(status(a.verificationStatus) ?? '') && IODINATED.includes((a.code?.coding?.[0]?.display ?? a.code?.text ?? '').toLowerCase()),
    );
    if (contrastAllergies.length > 1) throw new Error(`${ref}: ${contrastAllergies.length} contrast allergies`);
    let record: string | null = null;
    let severity: string | null = null;
    if (contrastAllergies[0]) {
      const a = contrastAllergies[0];
      const agent = (a.code?.coding?.[0]?.display ?? a.code?.text ?? '').toLowerCase();
      const day = notes.filter(({ d, text }) => of(ref)(d) && d.date !== undefined && clinicDate(d.date) === clinicDate(a.onsetDateTime!) && text.toLowerCase().includes(agent));
      if (day.length !== 1) throw new Error(`${ref}: ${day.length} notes record the ${agent} reaction`);
      record = key(day[0]!.d);
      severity = new RegExp(`\\b(${SEVERITY.join('|')}) allergic-like reaction`, 'i').exec(day[0]!.text)?.[1]?.toLowerCase() ?? null;
      if (severity === null) throw new Error(`${record}: no graded reaction`);
    }
    const regimen = !study.contrast || severity === null ? 'none' : severity === 'severe' ? 'no_contrast' : 'premedicate';
    const contrastGiven = study.contrast && regimen !== 'no_contrast';
    const before = (hours: number[]) => hours.map((h) => eastern(scan - h * HOUR));

    // §4: creatinine, the window and acute kidney injury.
    const scr = all<Obs>('Observation')
      .filter((o) => of(ref)(o) && o.status !== 'entered-in-error' && o.status !== 'cancelled' && (o.code?.coding ?? []).some((c) => c.system === LOINC && c.code === SCR) && o.effectiveDateTime !== undefined)
      .sort((a, b) => Date.parse(a.effectiveDateTime!) - Date.parse(b.effectiveDateTime!));
    const inWindow = scr.filter((o) => Date.parse(o.effectiveDateTime!) >= scan - 30 * DAY && Date.parse(o.effectiveDateTime!) < scan);
    // AKI by the creatinine rule: a later value 0.3 above an earlier one within 48 hours, or 1.5
    // times it within 7 days, with no value after it back within 0.3 of that baseline.
    const labAki = scr.flatMap((late, j) =>
      scr.slice(0, j).flatMap((early) => {
        const dt = Date.parse(late.effectiveDateTime!) - Date.parse(early.effectiveDateTime!);
        const [x, y] = [early.valueQuantity!.value!, late.valueQuantity!.value!];
        const rise = (dt <= 2 * DAY && y - x >= 0.3) || (dt <= 7 * DAY && y >= 1.5 * x);
        const recovered = scr.slice(j + 1).some((o) => o.valueQuantity!.value! - x < 0.3);
        return rise && !recovered && Date.parse(late.effectiveDateTime!) < scan ? [[key(early), key(late)]] : [];
      }),
    );
    // AKI recorded in a note before the scan, unresolved at discharge and since (the imaging
    // center's booking screen asks about it on every contrast booking and records no diagnosis).
    const noteAki = notes.flatMap(({ d, text }) => {
      if (!of(ref)(d) || d.date === undefined || Date.parse(d.date) > scan || !/\bacute kidney injury\b/i.test(text.replace(SCREEN, ''))) return [];
      const discharge = /\b(?:creatinine|cr) at discharge:\s*(\d+(?:\.\d+)?)\s*mg\/dL/i.exec(text)?.[1];
      const baseline = /baseline about (\d+(?:\.\d+)?)\s*mg\/dL/i.exec(text)?.[1];
      if (discharge === undefined || baseline === undefined) throw new Error(`${key(d)}: an acute kidney injury without a discharge creatinine and a baseline`);
      const later = scr.filter((o) => Date.parse(o.effectiveDateTime!) > Date.parse(d.date!));
      const resolved = Number(discharge) - Number(baseline) < 0.3 || later.some((o) => o.valueQuantity!.value! - Number(baseline) < 0.3);
      return resolved ? [] : [key(d)];
    });
    if (labAki.length > 1 || noteAki.length > 1) throw new Error(`${ref}: more than one record of acute kidney injury`);
    const aki = labAki.length > 0 || noteAki.length > 0;
    const latest = inWindow.at(-1);
    const egfr = latest ? ckdEpi2021(latest.valueQuantity!.value!, age, female) : null;
    const low = egfr !== null && egfr < 30;
    const required = contrastGiven && (age >= 60 || diabetes);
    const creatinine = !required ? 'not_required' : latest === undefined || aki ? 'order' : 'current';

    // §6: metformin.
    const metformins = all<Med>('MedicationRequest').filter((m) => of(ref)(m) && isActive(m) && isDrug(m.medicationCodeableConcept, { ingredient: 'metformin' }));
    if (metformins.length > 1) throw new Error(`${ref}: ${metformins.length} active metformin requests`);
    const hold = contrastGiven && (aki || low);

    const cls = !study.contrast ? 'filler' : record !== null ? 'allergy_grade' : metformins.length > 0 && hold ? 'metformin_hold' : 'egfr_window';
    const saline = contrastGiven && (aki || low);

    // The records each decision turns on (R1). Under 60 only diabetes makes §4 apply. A creatinine
    // in the window would count as current, so with one on file only the injury orders a new one
    // and its records decide the order; with none on file the diabetes alone orders it, and the
    // injury is a second route to the same order (R21 any-of: a note that records the injury and
    // names the diabetes shows the diabetes, R2).
    const injury = noteAki[0] ? [noteAki[0]] : (labAki[0] ?? []);
    const why = aki ? injury : latest ? [key(latest)] : [];
    const basis = age >= 60 || diabetic === undefined ? [] : [key(diabetic)];
    const decides = {
      order: record ? [record] : [],
      premedication: record ? [record] : [],
      consult: record ? [record] : [],
      creatinine: creatinine !== 'order' ? [] : latest !== undefined && aki ? injury : basis,
      saline: saline ? why : [],
      metformin: hold && metformins.length > 0 ? why : [],
    };
    const decisive = [...new Set(Object.values(decides).flat())];
    // Where each decisive record's fact shows in a note's text (R2).
    const mine = notes.filter(({ d }) => of(ref)(d));
    const shown = [
      ...(record ? [{ id: record, note: record, phrase: `${severity} allergic-like reaction` }] : []),
      ...(diabetic && decisive.includes(key(diabetic))
        ? mine.flatMap(({ d, text }) => [
          ...(/diabetes or metformin: yes/i.test(text) ? [{ id: key(diabetic), note: key(d), phrase: 'Diabetes or metformin: yes' }] : []),
          ...(/type 2 diabetes/i.test(text) ? [{ id: key(diabetic), note: key(d), phrase: 'type 2 diabetes' }] : []),
        ])
        : []),
      ...decisive.filter((k) => k.startsWith('DocumentReference/') && k !== record).map((k) => ({ id: k, note: k, phrase: 'acute kidney injury' })),
    ];
    return {
      patient: ref,
      name: [...(name?.given ?? []), name?.family ?? ''].join(' '),
      class: cls,
      appointment: key(appt),
      start: eastern(scan),
      code: study.code,
      contrast: study.contrast,
      regimen,
      prednisone: regimen === 'premedicate' ? { mg: 50, at: before([13, 7, 1]) } : null,
      diphenhydramine: regimen === 'premedicate' ? { mg: 50, at: before([1]) } : null,
      creatinine,
      saline: saline ? { at: eastern(scan - HOUR) } : null,
      metformin: metformins[0] === undefined ? null : { id: key(metformins[0]), hold },
      decides,
      decisive,
      shown,
    };
  });

  const radiologists = new Set(slots.flatMap((a) => (a.participant ?? []).map((p) => p.actor?.reference ?? '').filter((r) => r.startsWith('Practitioner/'))));
  if (radiologists.size !== 1) throw new Error(`${radiologists.size} radiologists on the list`);
  return { date: DATE, radiologist: [...radiologists][0]!, items };
}
