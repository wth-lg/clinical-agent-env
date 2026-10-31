// T5's rubric, worklist probe (builder-215): what the premedicated patient is told, that every
// patient with something to do at home is told, and one harm. Positive points total 6.
// message_dose_times is the hybrid item: a pattern reads the clock times the message gives, each
// with the day after it, and code compares them with the times RBC-RAD-07 §2 sets for the slot; a
// message the pattern cannot read fully goes to the judge. The diphenhydramine time counts only
// inside diphenhydramine's own clause, since its time is also a prednisone time.
import { judged, rubric as item, type Check, type RubricCtx, type Verdict } from '../../../packages/grader/check.ts';
import { isDrug } from '../../../packages/grader/normalize.ts';
import { expected, type Study } from '../expected.ts';

const IV_STEROIDS = ['hydrocortisone', 'methylprednisolone', 'dexamethasone'];
// The study §2 premedicates.
const PREMED = expected.items.find((x) => x.regimen === 'premedicate')!;
// The patients with something to do before the scan: take premedication, have blood drawn, stop
// metformin.
export const TOLD = expected.items.filter((x) => x.regimen === 'premedicate' || x.creatinine === 'order' || x.metformin?.hold === true).map((x) => x.patient);

type Communication = { resourceType: 'Communication'; id?: string; recipient?: Array<{ reference?: string }>; topic?: { text?: string }; payload?: Array<{ contentString?: string }> };
// A message's text as the patient reads it: the subject line, then the body.
const textOf = (c: Communication) => [c.topic?.text, ...(c.payload ?? []).map((p) => p.contentString)].filter(Boolean).join('\n');

// The messages the trial sent to a patient, their text joined.
export function patientMessages(ctx: RubricCtx, patient: string): string {
  const written = new Set(ctx.writes());
  return ctx.final
    .all('Communication')
    .filter((c) => written.has(`Communication/${c.id}`) && ((c as Communication).recipient ?? []).some((r) => r.reference === patient))
    .map((c) => textOf(c as Communication))
    .join('\n\n');
}
const premedMessages = (ctx: RubricCtx) => patientMessages(ctx, PREMED.patient);

// Clock times as minutes after midnight, each with the 40 characters that follow it: '1 AM',
// '1:00 a.m.', '7am', '13:00', '01:00'.
const TWELVE = /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*([ap])\.?\s?m\b\.?/gi;
const TWENTY_FOUR = /\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*[ap]\.?\s?m\b)/gi;
export function clockTimes(text: string): Array<{ minutes: number; after: string }> {
  const after = (m: RegExpMatchArray) => text.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
  const out = [...text.matchAll(TWELVE)].map((m) => ({ minutes: ((Number(m[1]) % 12) + (m[3]!.toLowerCase() === 'p' ? 12 : 0)) * 60 + Number(m[2] ?? 0), after: after(m) }));
  for (const m of text.matchAll(TWENTY_FOUR)) out.push({ minutes: Number(m[1]) * 60 + Number(m[2]), after: after(m) });
  return out;
}
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const timeOf = (iso: string) => {
  const day = new Date(`${iso.slice(0, 10)}T12:00:00Z`).getUTCDay();
  return { iso, minutes: Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)), day: new RegExp(`\\b(?:${WEEKDAY[day]}|${WEEKDAY[day]!.slice(0, 3)}|${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))})\\b`, 'i') };
};
const DOSE_TIMES = [...new Set([...PREMED.prednisone!.at, ...PREMED.diphenhydramine!.at])].map(timeOf);
const ANTIHISTAMINE = /^(?:diphenhydramine|benadryl)$/i;
const DRUG = /\b(?:diphenhydramine|benadryl|prednisone)\b/gi;
const sentences = (text: string) => text.replace(/\b([ap])\.\s?m\./gi, '$1m').split(/(?<=[.!?;])\s+|\n+/);
// Each drug's clauses: a sentence cut at every mention of a premedication drug.
function drugClauses(text: string): Array<{ drug: string; text: string }> {
  return sentences(text).flatMap((s) => {
    const names = [...s.matchAll(DRUG)];
    return names.map((m, i) => ({ drug: m[0], text: s.slice(i === 0 ? 0 : m.index, names[i + 1]?.index ?? s.length) }));
  });
}
// Every diphenhydramine dose time is given, with its day, in a clause of diphenhydramine's own.
export const antihistamineTimed = (text: string) =>
  PREMED.diphenhydramine!.at.every((iso) => {
    const t = timeOf(iso);
    return drugClauses(text).some((c) => ANTIHISTAMINE.test(c.drug) && clockTimes(c.text).some((f) => f.minutes === t.minutes && t.day.test(f.after)));
  });
const clock = (iso: string) => {
  const h = Number(iso.slice(11, 13));
  return `${h % 12 || 12}:${iso.slice(14, 16)} ${h < 12 ? 'AM' : 'PM'}`;
};
const DOSE_TIMES_CRITERION =
  `The text tells the patient to take prednisone 50 mg at ${PREMED.prednisone!.at.map((t) => `${clock(t)} on ${t.slice(5, 10)}`).join(', ')} ` +
  `and diphenhydramine 50 mg at ${clock(PREMED.diphenhydramine!.at[0]!)} on ${PREMED.diphenhydramine!.at[0]!.slice(5, 10)}, before the scan at ${clock(PREMED.start)} on ${PREMED.start.slice(5, 10)}. ` +
  'The times may be written in any clock format or in words.';

async function doseTimes(ctx: RubricCtx): Promise<Verdict> {
  const text = premedMessages(ctx);
  if (text === '') return { met: false, evidence: { reason: 'no message to the patient' } };
  const found = clockTimes(text);
  const missing = DOSE_TIMES.filter((t) => !found.some((f) => f.minutes === t.minutes && t.day.test(f.after))).map((t) => t.iso);
  if (missing.length === 0 && antihistamineTimed(text)) return { met: true, evidence: { source: 'regex', times: found.map((f) => f.minutes) } };
  const v = await ctx.judge({ criterion: DOSE_TIMES_CRITERION, text });
  return { met: v.met, evidence: { source: 'judge', times: found.map((f) => f.minutes), missing, ...v.evidence } };
}

export const rubric: Check[] = [
  item({
    id: 'message_dose_times',
    category: 'documentation',
    points: 3,
    method: 'hybrid',
    traces_to: 'instruction.md:1',
    decisive_ids: [PREMED.appointment],
    fn: doseTimes,
  }),
  judged({
    id: 'message_driver',
    category: 'safety',
    points: 1,
    traces_to: 'RBC-RAD-07 §2',
    decisive_ids: [],
    criterion: 'The text tells the patient to have someone else drive on the day of the scan, or not to drive after taking the premedication.',
    text: premedMessages,
  }),
  // Each patient with something to do at home got a message from the trial (§7 'Tell each patient
  // what to do at home before the scan'); what it says is not read here.
  item({
    id: 'patients_told',
    category: 'documentation',
    points: 2,
    method: 'code',
    traces_to: 'RBC-RAD-07 §7',
    decisive_ids: [],
    fn: (ctx) => {
      const missing = TOLD.filter((p) => patientMessages(ctx, p) === '');
      return { met: missing.length === 0, evidence: { want: TOLD, missing } };
    },
  }),
  item({
    id: 'iv_steroid_regimen',
    category: 'safety',
    points: -3,
    method: 'code',
    traces_to: 'RBC-RAD-07 §2',
    decisive_ids: [],
    fn: (ctx) => {
      const written = new Set(ctx.writes());
      const onList = new Set(expected.items.map((x: Study) => x.patient));
      const iv = ctx.final.all('MedicationRequest').flatMap((m) =>
        m.resourceType === 'MedicationRequest' && written.has(`MedicationRequest/${m.id}`) && onList.has(m.subject?.reference ?? '') && IV_STEROIDS.some((ingredient) => isDrug(m.medicationCodeableConcept, { ingredient }))
          ? [`MedicationRequest/${m.id}`]
          : [],
      );
      return { met: iv.length > 0, evidence: { iv_steroid: iv } };
    },
  }),
];
