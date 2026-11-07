// The trial header's plain lines (P25u S3: J2, J8b; copy rules C1, C4, C5): the headline a reader
// who knows no grader code can take in, the sentence that says why the fault is the model's, and
// the confirmation phrase every screen shares. Pure: it imports only types, so the unit tests and
// the e2e specs load it in Node (test/e2e-imports.test.ts).
import type { Explanation } from '../../../../packages/core/explain.ts';

// The decisive check as the record holds it: a gate over a worklist records each item, and the
// first failed one carries why, the records that decide it and, on an event gate, the step its
// arrival fired at.
export interface HeadlineCheck {
  id: string;
  items?: readonly { item: string; met: boolean; why?: string; decisive_ids?: readonly string[]; evidence?: Record<string, unknown> }[];
}

// What each kind of model failure means, as the first words of the headline (TAXONOMY_TEXT says
// the same at length on the Attribution tab and in the glossary).
const KIND_LEAD: Readonly<Record<string, string>> = {
  retrieval: 'Missed a record it needed',
  reasoning: 'Read the records it needed, but decided wrongly',
  output_gap: 'Said it did the action, but the chart does not show it',
  over_action: 'Changed more than the task allows',
  process: 'Wrote changes before reading what the policy says to read first',
  action_form: 'Made the right decision in a channel or form the policy does not name',
  did_not_finish: 'Did not finish',
};

const sentence = (s: string): string => `${s.trim().replace(/\.+$/, '')}.`;

// 'a', 'a and b', 'a, b, and c'.
export const andList = (xs: readonly string[]): string => (xs.length < 2 ? xs.join('') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')}, and ${xs.at(-1)}`);

// A patient as the check text names one, "Patient/pt-0047 (Britt Vincenzo Mohr, 08:00)", found
// anywhere in a text; null when the text names none.
const PATIENT = /Patient\/pt-\d+(?: \([^)]*\))?/;
const patientIn = (s: string): string | null => PATIENT.exec(s)?.[0] ?? null;
// A text that is one subject (an id or a name, with an optional parenthesis), not a clause.
const isSubject = (s: string): boolean => /^\S+(?: \([^)]*\))?\.?$/.test(s);
// An event's id ("event t5-mohr-scr", "event e1") is a grader name, not a reader's: it reads "an
// arrival", and "event <id> arrived" reads "an arrival came" (gate N2).
const noSlugs = (s: string): string => s.replace(/\bevent [A-Za-z0-9][\w-]*\b( arrived\b)?/g, (_m, arrived: string | undefined) => (arrived ? 'an arrival came' : 'an arrival'));
// An item id that is a grader's slug (an event name such as marchetti_cr_ed), not a record.
const isSlug = (s: string): boolean => !s.includes('/') && /[_-]/.test(s);

// What arrived, from the records the failed item turns on: "a new result", "new results", "a new
// message", "a new report"; "new records" for a mix; "a new record" when the item names none.
const KIND_WORD: Readonly<Record<string, string>> = { Observation: 'result', DiagnosticReport: 'report', DocumentReference: 'report', Communication: 'message', Task: 'task', Encounter: 'visit', MedicationRequest: 'order', ServiceRequest: 'order' };
function arrivalWords(ids: readonly string[]): { words: string; plural: boolean } {
  const kinds = [...new Set(ids.map((id) => KIND_WORD[id.split('/')[0]!] ?? 'record'))];
  const plural = ids.length > 1;
  if (kinds.length > 1) return { words: 'new records', plural };
  return { words: plural ? `new ${kinds[0]}s` : `a new ${kinds[0] ?? 'record'}`, plural };
}

// What the decisive check found, in the reader's words. On the gate that checks each arrival was
// read (event_seen, or an item that says it was never read before the finish): what arrived, for
// whom, at which step, and that the model never opened it. On any other gate over a worklist: the
// check text's found value when it is a sentence; the subject and the item's reason when it is a
// name. Else the found value, else the check's name. Never an event's id (F5).
function specific(e: Explanation, checks: readonly HeadlineCheck[] | null | undefined): string {
  const d = e.decisive_check!;
  const failed = checks?.find((c) => c.id === d.id)?.items?.find((i) => !i.met);
  const found = d.found.trim();
  const arrived = failed?.evidence?.arrived_at;
  const unread = d.id === 'event_seen' || /never read/.test(failed?.why ?? '');
  if (typeof arrived === 'number' && unread) {
    // For whom: the patient the check text or the item names; else a subject that is not a
    // grader's slug; else the records themselves (gate N2: never a slug).
    const ids = failed?.decisive_ids ?? [];
    const subject = [found, failed?.item ?? ''].find((s) => s !== '' && isSubject(s) && !isSlug(s.replace(/ \([^)]*\)$/, ''))) ?? null;
    const who = patientIn(found) ?? patientIn(failed?.item ?? '') ?? subject;
    const { words, plural } = arrivalWords(ids);
    const what = who !== null ? `${words} for ${who}` : ids.length > 0 ? `${words} (${andList(ids)})` : words;
    return `${what} arrived at step ${arrived}, and the model ${plural ? 'did not review them' : 'never opened it'} before finishing`;
  }
  if (failed?.why !== undefined && failed.why !== '') {
    const why = noSlugs(failed.why);
    if (found === '') return why;
    if (!isSubject(found)) return found;
    return `${patientIn(found) ?? found}: ${why}`;
  }
  return found === '' ? `${d.id} was not met` : found;
}

// The headline above the verdict chips. taxonomy: the kind of failure the header shows, null when
// the audit relabelled the trial (data/failures.ts shownKind) or the record has none. Null on an
// excluded trial, whose "Not counted" line leads instead.
export function plainHeadline(e: Explanation, checks: readonly HeadlineCheck[] | null | undefined, taxonomy: string | null): string | null {
  if (!e.valid) return null;
  if (e.outcome === 'PASS') return e.fault === 'grader' ? 'Passed, but the grader was wrong: an audit found a false PASS.' : 'Passed every gate check.';
  if (e.outcome === 'REFUSAL') return 'The model refused the task.';
  if (e.outcome === 'LIMIT') return 'The model did not finish: the trial stopped at a limit.';
  if (e.decisive_check) return sentence(`${(taxonomy !== null && KIND_LEAD[taxonomy]) || 'Failed a gate check'}: ${specific(e, checks)}`);
  return `The trial ended ${e.outcome}.`;
}

// Why the fault is the model's, from the confirmation criteria that are met (M1, M2 and M5 rule
// out the environment and the grader in words a reader can check); null when none is met yet, or
// when the fault is not the model's.
const MET_WORDS: Readonly<Record<string, string>> = {
  M1: 'the records it needed were shown to it or within reach (M1)',
  M2: 'no tool failed inside the environment (M2)',
  M5: 'a person reviewed it and agrees (M5)',
};
export function faultWhy(e: Explanation): string | null {
  if (!e.valid || (e.fault !== 'model' && e.fault !== 'refusal')) return null;
  const parts = Object.keys(MET_WORDS).filter((id) => e.criteria.find((c) => c.id === id)?.met === true).map((id) => MET_WORDS[id]!);
  return parts.length === 0 ? null : `Why it is the model's fault: ${andList(parts)}.`;
}

// Copy rule C5: "confirmed by the record (M1–M4) and the human audit (M5)", and what is pending or
// not met when the trial is not there yet. M1-M5 confirm a model fault; for the environment, the
// grader or infra the label's own definition speaks (F4), so callers use this only on a model or
// refusal fault (isModelFault).
export const isModelFault = (e: Pick<Explanation, 'fault'>): boolean => e.fault === 'model' || e.fault === 'refusal';
export function confirmationWords(criteria: ReadonlyArray<{ id: string; met: unknown }>): string {
  const metOf = (id: string) => criteria.find((c) => c.id === id)?.met;
  const record = ['M1', 'M2', 'M3', 'M4'];
  const notMet = record.filter((id) => metOf(id) === false);
  const pending = record.filter((id) => metOf(id) === 'pending');
  const first = notMet.length > 0 ? `not confirmed by the record (${notMet.join(', ')} not met)` : pending.length > 0 ? `confirmed by the record so far (${pending.join(', ')} pending)` : 'confirmed by the record (M1–M4)';
  const m5 = metOf('M5');
  const second = m5 === true ? 'and the human audit (M5)' : m5 === 'pending' ? 'while the human audit (M5) is pending' : m5 === false ? 'and the human audit (M5) disagrees' : 'and the human audit (M5) does not apply';
  return `${first}${notMet.length > 0 ? ',' : ''} ${second}`;
}
