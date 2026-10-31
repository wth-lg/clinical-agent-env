// Discoverability for the T4 worklist (plan-amendment-worklist design rule: decisive facts are not
// on page 1 of the first broad search; they are reachable by a route the policy implies, and the
// oracle takes it). Three parts:
//   1. A stand-in set of first broad searches for this worklist (W1; written for the worklist form,
//      not pilot-2's pre-worklist queries; W2 replaces them with probe-1's first searches). On page 1
//      of each, no trap-deciding record is found: none is exposed (a note or report shown whole, or
//      a resource shown with the fields a clinician acts on) and no snippet shows all the atoms that
//      make it seen (R29). An item's plain input may appear (R6; PLAIN_INPUT below).
//   2. The oracle's trajectory exposes every decisive id, and sees every item's decisive records by
//      the gates' rule (tests/grader.ts firstSeen), before its first write.
//   3. Each rule term the policy uses retrieves its evidence with search_notes, which does not stem
//      (verifier-phase-P17i-W0-3-pilot3-1 F1).
// Broad searches are clinic-wide sorts and lists, and per-patient lists, that name no rule term.
// A targeted search for a term the policy uses ('potassium', 'addendum', 'fill history',
// 'laboratory report', 'formulary substitution'), with or without a patient, is a retrieval route
// RBC-TOC-02 implies (R5), not a first broad search, and is exempt from the page-1 rule (coordinator
// ruling R12; verifier-W1-probe-T4-1 F1: a clinic-wide 'potassium' search shows both lab reports'
// potassium lines). Part 3 asserts those routes; RULE_TERMS lists them, and the test below checks
// that no BROAD search names one and that each is a term the policy text states.
// A search for a word that names the hazard an item tests is the retrieval skill working, not a
// first broad search, and is exempt the same way (coordinator ruling R25; verifier-W1-probe-T4-3
// N1). HAZARD_WORDS lists them, with the hazard each names:
//   correction    §1, a signed addendum's correction overrides the summary's line
//   addendum      §1, the record that carries the correction
//   stop          §6 and §7, a discharge line that ends a drug ('Potassium chloride: stop')
//   held          §2 and §7, a drug the stay held and the condition for its resume
//   substitution  §3, an inpatient formulary interchange to reverse at discharge
// Clinic-wide 'stop', 'held' and 'correction' searches show the addenda's corrections and Kim's
// substitution clause on page 1; that is the hazard word finding its hazard. The test below checks
// that no BROAD search names one.
// A search by a lab panel or test name is a targeted results route (coordinator ruling R30): the
// reviewer is looking for results, and finding them is the retrieval skill working. It is exempt
// from the page-1 rule like a rule term. LAB_QUERIES lists the ones known to reach a decisive line:
//   basic metabolic panel   clinic-wide, page 1 shows Kim's "Potassium 5.4" and Roberts' "Potassium
//                           4.6" (verifier-W1-probe-T4-6 N1)
//   metabolic panel         the same two lines
// The test below checks that no BROAD search names one.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { clock } from '../../../packages/env/clock.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import { READ_TOOLS, type ReadContext } from '../../../packages/env/tools/read/index.ts';
import { callTool } from '../../../packages/env/tools/registry.ts';
import { firstExposed, sameId, seenBefore, stepsOf } from '../../../packages/grader/exposure.ts';
import { cases, trial } from '../../../packages/grader/matrix/matrix.ts';
import { trajectory } from '../../../packages/grader/test/helpers.ts';
import { expected } from '../expected.ts';
import { ref } from '../ids.ts';
import { firstSeen, firstSeenBy } from './grader.ts';

// Plain input (R6): records an item rests on that are not its trap. Earnest Roberts' creatinine
// after discharge is the condition his summary sets for the resume (R14, R21: the 10/20 clinic
// Observation or the 10/22 report's line, either one); the trap of roberts-lisinopril is which
// potassium is the most recent (LURES), so the creatinine may show on page 1 of a broad search.
const PLAIN_INPUT: ReadonlyArray<{ id: string; atoms?: readonly string[]; why: string }> = [
  { id: ref('Observation/obs-t4-roberts-scr-1020'), why: "roberts-lisinopril: the clinic creatinine of 1.24 on 10/20 meets the summary's 'SCr < 1.3'; it is the condition, not the trap" },
  { id: ref('DocumentReference/doc-t4-roberts-lab'), atoms: ['Creatinine 1.08'], why: "roberts-lisinopril: the report's creatinine line meets the same condition" },
];
const plain = (id: string, atoms?: readonly string[]) => PLAIN_INPUT.some((p) => p.id === id && JSON.stringify(p.atoms ?? null) === JSON.stringify(atoms ?? null));
// Every way a record of an item is seen, as [record, atoms] pairs (atoms absent: exposure), the
// trap-deciding ones only: several items share one discharge summary, each with its own line, so a
// map keyed by record would keep only one.
const ROUTES: ReadonlyArray<readonly [string, readonly string[] | undefined]> = [
  ...new Map(
    expected.items
      .flatMap((x) => x.decisive.flatMap((d) => [[d, x.atoms[d]] as const, ...(x.also?.[d] ?? []).map((s) => [s.id, s.atoms] as const)]))
      .filter(([d, atoms]) => !plain(d, atoms))
      .map(([d, atoms]) => [`${d}\n${JSON.stringify(atoms ?? null)}`, [d, atoms] as const]),
  ).values(),
];
// The trap-deciding records: page 1 of a broad search may not expose one (an exposed note is shown
// whole, so it is seen whatever its atoms).
const DECISIVE = [...new Set(expected.items.flatMap((x) => x.decisive).filter((d) => !plain(d)))];
const PATIENT_IDS = expected.patients.map((p) => p.patient.split('/')[1]!);

// Lures (R19): records that tempt the wrong action but cannot decide an item. They may show on page 1
// of a broad search; that makes the trap harder, not easier, so the page-1 rule does not apply to
// them. They are listed apart from the trap-deciding records (DECISIVE) for that reason.
const LURES: ReadonlyArray<{ id: string; tempts: string }> = [
  { id: ref('Observation/obs-t4-roberts-k-1020'), tempts: "roberts-lisinopril: the clinic potassium of 5.3 on 10/20 tempts a hold; the 10/22 report's 4.6 is the most recent and decides" },
  { id: ref('Observation/obs-t4-kim-scr-1016'), tempts: 'kim-lisinopril: the inpatient creatinine of 1.9 tempts a hold on creatinine; the potassium decides' },
  { id: ref('Observation/obs-t4-roberts-scr-1015'), tempts: 'roberts-lisinopril: the admission creatinine of 2.1 tempts a hold; it is before discharge' },
];

// The stand-in first broad searches: what a reviewer opening this worklist runs first, before any
// targeted read. Default page size (count) everywhere.
const BROAD: ReadonlyArray<{ name: string; input: Record<string, unknown> }> = [
  { name: 'search_notes', input: { query: 'discharge summary' } },
  { name: 'search_notes', input: { query: 'discharge medications' } },
  { name: 'search_notes', input: { query: 'St. Brigid discharge medication reconciliation' } },
  // Generic clinic-wide first searches on a discharge worklist (R6; verifier-W1-probe-T4-4 N2): they
  // name no rule term and no hazard word, so page 1 must show no addendum correction.
  { name: 'search_notes', input: { query: 'new medications' } },
  { name: 'search_notes', input: { query: 'admitted' } },
  ...expected.patients.map((p) => ({ name: 'search_patients', input: { name: p.name } })),
  // Clinic-wide newest-first lists a reviewer runs before a targeted read (R6): the newest
  // creatinines and potassiums, and the newest documents filed to any chart.
  { name: 'fhir_search', input: { resource_type: 'Observation', code: '2160-0', sort: '-date' } },
  { name: 'fhir_search', input: { resource_type: 'Observation', code: '2823-3', sort: '-date' } },
  { name: 'fhir_search', input: { resource_type: 'DocumentReference', sort: '-date' } },
  { name: 'fhir_search', input: { resource_type: 'DocumentReference', date_ge: '2026-10-16', sort: '-date' } },
  ...PATIENT_IDS.flatMap((pid) => [
    { name: 'fhir_search', input: { resource_type: 'MedicationRequest', patient: pid } },
    { name: 'fhir_search', input: { resource_type: 'DocumentReference', patient: pid } },
    { name: 'search_notes', input: { query: 'discharge medications', patient: pid } },
    { name: 'search_notes', input: { query: 'discharge summary', patient: pid, type: 'discharge-summary' } },
  ]),
];

describe('T4 worklist discoverability', async () => {
  const ctx: ReadContext = { world: await loadStore(matrixEnv().world), clock, policies: [], catalog: [] };
  const run = (call: { name: string; input: unknown }) => {
    const r = callTool(READ_TOOLS, call.name, call.input, ctx);
    return stepsOf(trajectory([{ name: call.name, input: call.input as Record<string, unknown>, content: r.content, exposed: r.exposed_ids, referenced: r.referenced_ids }]))[0]!;
  };

  it.each(BROAD.map((c) => [`${c.name} ${JSON.stringify(c.input)}`, c] as const))('page 1 of %s finds no decisive id', (_label, call) => {
    const step = run(call);
    expect(step.is_error, 'the search runs').toBe(false);
    const exposed = DECISIVE.filter((d) => step.exposed_ids.some((k) => sameId(k, d)));
    const shown = ROUTES.filter(([d, atoms]) => atoms !== undefined && firstSeenBy([step], d, atoms) !== null).map(([d, atoms]) => `${d} ${atoms!.join(' | ')}`);
    expect({ exposed, shown }).toEqual({ exposed: [], shown: [] });
  });

  // R12: the rule terms whose targeted searches are exempt routes, as the policy writes them.
  const RULE_TERMS = ['addendum', 'fill history', 'laboratory report', 'potassium', 'formulary substitution'];
  it('no broad search names a rule term, and every exempt rule term is one the policy states (R12)', async () => {
    const task = await loadMatrixTask('discharge-medrec');
    const policy = task.policies.map((p) => p.text).join('\n').toLowerCase();
    expect(RULE_TERMS.filter((t) => !policy.includes(t))).toEqual([]);
    const named = BROAD.filter((c) => typeof c.input.query === 'string' && RULE_TERMS.some((t) => (c.input.query as string).toLowerCase().includes(t)));
    expect(named).toEqual([]);
  });

  // R25: the hazard words whose searches are exempt routes (see the header).
  const HAZARD_WORDS = ['correction', 'addendum', 'stop', 'held', 'substitution'];
  it('no broad search names a hazard word (R25)', () => {
    const named = BROAD.filter((c) => typeof c.input.query === 'string' && HAZARD_WORDS.some((w) => new RegExp(`\\b${w}`, 'i').test(c.input.query as string)));
    expect(named).toEqual([]);
  });

  // R30: lab panel and test names whose searches are exempt routes (see the header).
  const LAB_QUERIES = ['basic metabolic panel', 'metabolic panel'];
  it('no broad search names a lab panel or test (R30)', () => {
    const named = BROAD.filter((c) => typeof c.input.query === 'string' && LAB_QUERIES.some((q) => (c.input.query as string).toLowerCase().includes(q)));
    expect(named).toEqual([]);
  });

  // R2: a fill-history item's record decides only it, so a snippet that shows its fill line counts
  // as seen; a targeted search for the drug shows it.
  it.each(expected.items.filter((x) => x.kind === 'flag_fill').map((x) => [x.key, x] as const))('a search_notes snippet for %s shows its decisive fill line (R2)', (_k, x) => {
    const step = run({ name: 'search_notes', input: { query: x.ingredient, patient: x.patient.split('/')[1]! } });
    expect(firstSeen([step], x, x.decisive[0]!)).not.toBeNull();
  });

  // R2 (verifier-W1-probe-T4-clinical-2 N1): an item a discharge-summary line decides has that line
  // as its phrase, so a targeted snippet that shows the line counts as seen.
  // R26 and R29 (verifier-W1-probe-T4-clinical-3 N1, verifier-W1-probe-T4-5 N1): a line counts as
  // seen when a snippet shows its atoms, so the rule-term 'potassium' snippet, a 'TSH' snippet cut
  // inside the Procardia line's route, and 'labs' and 'atorvastatin' snippets cut inside the word
  // 'Lisinopril' show their lines too.
  const LINE_QUERIES: ReadonlyArray<readonly [string, string]> = [
    ['kim-kcl', 'potassium chloride'], ['kim-omeprazole', 'formulary substitution'], ['kim-omeprazole', 'potassium'], ['stark-carvedilol', 'Coreg'],
    ['thompson-nifedipine', 'Procardia'], ['thompson-nifedipine', 'TSH'], ['roberts-lisinopril', 'resume home'], ['roberts-lisinopril', 'continue'],
    ['roberts-lisinopril', 'labs'], ['roberts-lisinopril', 'atorvastatin'], ['roberts-rosuvastatin', 'formulary substitution'],
  ];
  it.each(LINE_QUERIES)("a search_notes snippet for %s ('%s') shows its decisive discharge line (R2)", (key, query) => {
    const x = expected.items.find((i) => i.key === key)!;
    const summary = expected.patients.find((p) => p.patient === x.patient)!.summary;
    expect(x.atoms[summary], key).toBeDefined();
    const step = run({ name: 'search_notes', input: { query, patient: x.patient.split('/')[1]! } });
    expect(step.exposed_ids.some((k) => sameId(k, summary)), 'the snippet is cut: the summary is only referenced').toBe(false);
    expect(firstSeenBy([step], summary, x.atoms[summary])).not.toBeNull();
  });

  it('no lure is a decisive record, and every plain input is one (R19, R6)', () => {
    expect(LURES.filter((l) => expected.items.some((x) => x.decisive.includes(l.id) || Object.values(x.also ?? {}).flat().some((s) => s.id === l.id)))).toEqual([]);
    expect(PLAIN_INPUT.filter((p) => !expected.items.some((x) => x.decisive.includes(p.id) || Object.values(x.also ?? {}).flat().some((s) => s.id === p.id)))).toEqual([]);
  });

  it('the stand-in list covers every worklist patient', () => {
    expect(PATIENT_IDS.every((pid) => BROAD.some((c) => c.input.patient === pid))).toBe(true);
  });

  it("the oracle's trajectory exposes every decisive id, and sees every item's decisive records, before its first write", async () => {
    const task = await loadMatrixTask('discharge-medrec');
    const { events } = await trial(matrixEnv(), task, cases(task).find((c) => c.id === 'oracle')!);
    const steps = stepsOf(events);
    const firstWrite = steps.find((s) => s.written_ids.length > 0)!.n;
    const late = [...new Set(expected.items.flatMap((x) => x.decisive))].filter((d) => !seenBefore(steps, firstExposed(steps, d), firstWrite));
    const unseen = expected.items.flatMap((x) => x.decisive.filter((d) => !seenBefore(steps, firstSeen(steps, x, d), firstWrite)).map((d) => `${x.key} ${d}`));
    expect({ late, unseen }).toEqual({ late: [], unseen: [] });
  });

  // Each term the policy names a source by finds that source for the patient it belongs to.
  const TERMS: ReadonlyArray<[term: string, docs: (p: (typeof expected.patients)[number]) => ReadonlyArray<string | null>]> = [
    ['addendum', (p) => [p.addendum]],
    ['fill history', (p) => p.fills],
    ['laboratory report', (p) => [p.lab]],
    ['potassium', (p) => [p.lab]],
    ['formulary substitution', (p) => [expected.items.some((x) => x.patient === p.patient && x.kind === 'keep') ? p.summary : null]],
    ['discharge summary', (p) => [p.summary]],
  ];
  it.each(TERMS.flatMap(([term, docs]) => expected.patients.flatMap((p) => docs(p).flatMap((d) => (d === null ? [] : [[term, p.name, p.patient.split('/')[1]!, d] as const])))))(
    "search_notes '%s' for %s finds the document the policy means",
    (term, _name, pid, doc) => {
      const step = run({ name: 'search_notes', input: { query: term, patient: pid } });
      expect(step.referenced_ids.concat(step.exposed_ids).some((k) => sameId(k, doc))).toBe(true);
    },
  );
});
