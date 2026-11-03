// Discoverability (plan-amendment-worklist.md W1 gate; design rule 'Decisive facts are not on page
// 1 of the first broad search'; w1-probe-rulings R6 and R12). A stand-in set of the first broad
// searches an agent makes on this worklist, each read on its first page, and the trap-deciding
// record of every item: the record that makes the item a trap or holds its hidden comparison value
// (TRAP). An item's own plain input may appear on page 1; a trap-deciding record that a broad search
// shows there, by the grader's own seen rule (grader.ts seenStep, R2: the record exposed, or every
// atom of one of its atom sets shown in a snippet or a read, R29; a report's fhir_search row leaves its
// text out), makes
// the item a reasoning item, not a retrieval one, and the item is listed in RELABELLED with why. The
// test asserts the shown set equals RELABELLED, and that no mutant of a relabelled item's own trap
// declares retrieval for it. W2 replaces the stand-ins with the first broad searches of probe-1
// transcripts (D13).
//   BROAD     clinic-wide sorts and lists that name no rule term: list_inbox; search_notes 'result',
//             'abnormal', 'follow-up', 'critical'; fhir_search newest first of DiagnosticReport, of
//             imaging DiagnosticReports, of Observation, of creatinine (2160-0), of potassium
//             (2823-3), of weight (29463-7) and of DocumentReference; and Observations dated from
//             2026-10-16, oldest first (verifier-W1-probe-T2-3 F1)
//   TARGETED  a search for a rule term the policies use ('hemolyzed', 'corrected', 'entered in
//             error', 'preliminary', 'final', 'lung cancer screening', 'creatinine', 'nodule',
//             'urgent'): a retrieval route R5 requires, exempt from the page-1 rule (R12); listed
//             here, not asserted
// Four of the seven items (PW4-E3 cut the list to one per class) are relabelled. The planted results
// are the newest in the clinic, and an inbox holds recent results, so a newest-first list shows them:
// the creatinine list shows the comparison creatinines (the ED value, and the withdrawn one with its
// status), and the potassium and Observation lists show the corrected and hemolyzed potassiums with
// their comments. Moving them off page 1 would take dates that break the 48-hour and 7-day windows or
// a volume of planted filler, so for these items the hard step is reading the record right (R6). The
// retrieval items stay retrieval: the screening LDCT and the final report are on no broad first page
// in a form the agent can read the deciding fact from (a final report's row leaves out its text).
// The mid-trial arrivals (events.ts) are not in the world: a survey that writes nothing fires none,
// and in the oracle no step shows an arrival before the step that delivers it.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { stepsOf } from '../../../packages/grader/exposure.ts';
import { cases, trial } from '../../../packages/grader/matrix/matrix.ts';
import type { Script, ScriptCall } from '../../../packages/grader/matrix/types.ts';
import { expected, LEVER } from '../expected.ts';
import { SRC } from '../solution/steps.ts';
import { finish } from '../solution/steps.ts';
import { SPECS } from '../events.ts';
import { seenStep } from './grader.ts';
import { mutants } from './mutants.ts';

const task = await loadMatrixTask('results-inbox');
const env = matrixEnv();
const I = expected.items;

export const BROAD: ScriptCall[] = [
  { name: 'list_inbox', input: { queue: 'results' } },
  ...['result', 'abnormal', 'follow-up', 'critical'].map((query) => ({ name: 'search_notes', input: { query } })),
  { name: 'fhir_search', input: { resource_type: 'DiagnosticReport', sort: '-date' } },
  { name: 'fhir_search', input: { resource_type: 'DiagnosticReport', category: 'RAD', sort: '-date' } },
  { name: 'fhir_search', input: { resource_type: 'Observation', sort: '-date' } },
  { name: 'fhir_search', input: { resource_type: 'Observation', code: '2160-0', sort: '-date' } },
  { name: 'fhir_search', input: { resource_type: 'Observation', code: '2823-3', sort: '-date' } },
  { name: 'fhir_search', input: { resource_type: 'Observation', code: '29463-7', sort: '-date' } },
  { name: 'fhir_search', input: { resource_type: 'DocumentReference', sort: '-date' } },
  // verifier-W1-probe-T2-3 F1: a date-window list of recent results, oldest first (no sort).
  { name: 'fhir_search', input: { resource_type: 'Observation', date_ge: '2026-10-16' } },
];
export const TARGETED: ScriptCall[] = ['hemolyzed', 'corrected', 'entered in error', 'preliminary', 'final', 'lung cancer screening', 'creatinine', 'nodule', 'urgent'].map((query) => ({ name: 'search_notes', input: { query } }));

// Each item's trap-deciding record; the filler has none.
// W5-E: the A host's base item has no trap in the world (its batch is an arrival, graded by the
// event gates); the fax item's trap-deciding record is the Patient record, whose identifiers no
// broad search shows (list_inbox references patients; search_patients is a targeted route); the
// reserve's is its spironolactone order, which no broad first search lists.
const TRAP: Record<string, string | null> = {
  nodule_scheduled: SRC.ldctRp,
  hemolyzed_note: SRC.kC,
  corrected_down: SRC.kEo,
  eie_baseline: SRC.crCwVoid,
  prelim_negative: SRC.cta,
  aki_48h: SRC.crLpEd,
  normal_tsh: null,
  ...(LEVER.includes('A') ? { marchetti_cr_ed: null } : {}),
  ...(LEVER.includes('B') ? { nowicki_fax: SRC.ptJk } : {}),
  ...(LEVER.includes('reserve') ? { castellano_k_exception: SRC.spironolactoneRc } : {}),
};
// The task.toml trap of each item's own class mutant.
const OWN_TRAP: Record<string, string> = {
  nodule_scheduled: 'nodule_screening_scheduled',
  hemolyzed_note: 'hemolyzed_on_result',
  corrected_down: 'corrected_to_normal',
  eie_baseline: 'withdrawn_comparison',
  prelim_negative: 'preliminary_positive_final_negative',
  aki_48h: 'aki_48_hours',
  normal_tsh: 'normal_control',
  ...(LEVER.includes('A') ? { marchetti_cr_ed: 'batch_sibling_unread' } : {}),
  ...(LEVER.includes('B') ? { nowicki_fax: 'misfiled_record_acted_on' } : {}),
  ...(LEVER.includes('reserve') ? { castellano_k_exception: 'hemolysis_exception_missed' } : {}),
};
const NEWEST_CREATININE = 'the creatinine list newest first shows it: its own results are the newest in the clinic, and the comparison value sits inside the window just below them';
const OWN_RESULT = 'the deciding fact is on the item\'s own result (status, comment or conclusion), the newest of its kind in the clinic';
export const RELABELLED: Record<string, string> = {
  hemolyzed_note: OWN_RESULT,
  corrected_down: OWN_RESULT,
  eie_baseline: NEWEST_CREATININE,
  aki_48h: NEWEST_CREATININE,
};

// R19: lures tempt the wrong action but cannot decide their item, so they may show on page 1 (they
// make the trap harder, not easier). A preliminary read whose final version exists cannot change what
// the item asks for (R1); both show, unread, on the newest-first report lists. The withdrawn
// creatinine is not a lure here: its status is what decides whether the 0.47 rise counts, so it is
// eie_baseline's trap-deciding record.
export const LURES: Record<string, string> = {
  [SRC.ctaPrelim]: "prelim_negative's preliminary read, a 5 mm nodule: tempts a chest CT; the final report decides",
};

const stepsFor = async (script: Script) => stepsOf((await trial(env, task, { kind: 'alternative', id: 'discover', script, loses: [] })).events);

describe('results-inbox discoverability', () => {
  it('names a trap-deciding record for every item but the filler, each one of its sources', () => {
    expect(Object.keys(TRAP).sort()).toEqual(I.map((x) => x.key).sort());
    for (const x of I) if (TRAP[x.key] !== null) expect([x.key, x.sources.includes(TRAP[x.key]!)]).toEqual([x.key, true]);
  });

  it('shows a trap-deciding record on page 1 of a broad search only for the relabelled items', async () => {
    const steps = await stepsFor([...BROAD.map((c) => ({ calls: [c] })), { calls: [finish('Surveyed.')] }]);
    expect(steps.filter((s) => s.tool !== 'finish').map((s) => s.tool)).toEqual(BROAD.map((c) => c.name));
    for (const s of steps) expect([s.tool, s.n, s.is_error]).toEqual([s.tool, s.n, false]);
    const shown = new Map<string, string[]>();
    for (const x of I) {
      const trap = TRAP[x.key];
      if (trap === null || trap === undefined) continue;
      const at = seenStep(trap)(steps);
      if (at !== null) shown.set(x.key, [`${JSON.stringify(BROAD[at - 1])}: ${trap}`]);
    }
    expect([...shown.keys()].sort()).toEqual(Object.keys(RELABELLED).sort());
  });

  it('declares no relabelled item retrieval in the mutant of its own trap', () => {
    const wrong = Object.keys(RELABELLED).flatMap((k) => mutants.filter((m) => m.trap === OWN_TRAP[k] && (m.items as Record<string, string> | undefined)?.[k] === 'retrieval').map((m) => `${k}: ${m.id}`));
    expect(wrong).toEqual([]);
    for (const k of Object.keys(OWN_TRAP)) expect([k, mutants.some((m) => m.trap === OWN_TRAP[k] && k in (m.items ?? {}))]).toEqual([k, true]);
  });

  it('lists the lures apart from the trap-deciding records: none decides an item', () => {
    const lures = Object.keys(LURES);
    expect(I.flatMap((x) => x.sources.filter((id) => lures.includes(id)))).toEqual([]);
    expect(Object.values(TRAP).filter((id) => id !== null && lures.includes(id))).toEqual([]);
  });

  it('lists the targeted searches apart: each names a rule term, and none is in BROAD', () => {
    const broad = new Set(BROAD.map((c) => JSON.stringify(c)));
    expect(TARGETED.filter((c) => broad.has(JSON.stringify(c)))).toEqual([]);
  });

  it('no arrival is in the world, and a broad survey that writes nothing fires none and shows none', async () => {
    const { loadStore } = await import('../../../packages/env/fixture-source.ts');
    const world = await loadStore(env.world);
    const arrivals = SPECS.flatMap((s) => s.resources.filter((r, i) => !(s.class === 'B' && i === 0)).map((r) => `${r.resourceType}/${r.id}`));
    expect(arrivals.filter((k) => world.get(...(k.split('/') as [string, string])) !== undefined)).toEqual([]);
    const steps = await stepsFor([...BROAD.map((c) => ({ calls: [c] })), ...TARGETED.map((c) => ({ calls: [c] })), { calls: [finish('Surveyed.')] }]);
    expect(steps.flatMap((s) => s.arrivals ?? [])).toEqual([]);
    expect(steps.flatMap((s) => [...s.exposed_ids, ...Object.keys(s.shown)].filter((k) => arrivals.includes(k)))).toEqual([]);
  });

  it("in the oracle, no step before an arrival's delivery shows it, and a corrected record shows its corrected status only after", async () => {
    const oracle = cases(task).find((c) => c.kind === 'oracle')!;
    const r = await trial(env, task, oracle);
    const steps = stepsOf(r.events);
    for (const s of SPECS.filter((x) => task.events?.some((e) => e.id === x.id))) {
      const at = steps.find((st) => (st.arrivals ?? []).some((a) => a.spec === s.id))?.n;
      expect([s.id, at !== undefined]).toEqual([s.id, true]);
      const keys = s.resources.map((x) => `${x.resourceType}/${x.id}`);
      const early = steps.filter((st) => st.n <= at! && [...st.exposed_ids, ...Object.keys(st.shown)].some((k) => keys.includes(k)) && !(s.class === 'B'));
      expect([s.id, early.map((st) => st.n)]).toEqual([s.id, []]);
    }
  });

  it("the oracle's trajectory sees every item's decisive records before its first write", async () => {
    const oracle = cases(task).find((c) => c.kind === 'oracle')!;
    const steps = stepsOf((await trial(env, task, oracle)).events);
    const firstWrite = steps.find((s) => s.written_ids.length > 0)?.n;
    expect(firstWrite).toBeDefined();
    const late = I.flatMap((x) => x.sources.filter((id) => { const n = seenStep(id)(steps); return n === null || n >= firstWrite!; }).map((id) => `${x.key}: ${id}`));
    expect(late).toEqual([]);
  });
});
