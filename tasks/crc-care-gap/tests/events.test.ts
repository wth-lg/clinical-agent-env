// crc-care-gap's mid-trial events (plan-amendment-w4 PW4-E3; events.ts). The list is cut to four
// members, each hosting one event: three amend events (classes B, B, O) and one lure (class D).
// Every trigger is after_exposed on one all-of decisive record of its item: a record that every
// route passing the item must expose, so no passing route leaves the event unfired (Addendum 2).
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { loadMatrixTask, matrixEnv } from '../../../cli/matrix.ts';
import { activeSpecs, AMEND_CLASSES } from '../../../packages/env/events.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import { stepsOf } from '../../../packages/grader/exposure.ts';
import { cases, gradeRun, NULL_AGENT, trial, type MatrixEnv, type Miss } from '../../../packages/grader/matrix/matrix.ts';
import { EVENT_MUTANTS, type MatrixTask, type Script, type WorldView } from '../../../packages/grader/matrix/types.ts';
import type { Task, TaskSource } from '../../../packages/core/tasks.ts';
import * as events from '../events.ts';
import { DELIVERED, expected, LEVER, panelOf } from '../expected.ts';
import { derive } from '../policy.ts';
import { actions, arrivals, finish, GAPS, PT, reads, recheck } from '../solution/steps.ts';
import { checksFor } from './grader.ts';
import { mutants, TWIN_TABLE, twinMutants } from './mutants.ts';

// plan-amendment-w4, Event mechanism table, row "Policy sentence": the same in all six policies.
export const POLICY_SENTENCE =
  'Results, corrections and messages can arrive in your queues while you work. Before you finish, review anything that arrived after you started. ' +
  'If it changes a decision you already recorded under this protocol, correct that decision (change, hold or stop the order, or send a corrected message) and record why. ' +
  'If it does not change the decision under this protocol, leave the decision in place.';

const specs = activeSpecs(events);

const A_ON = LEVER.includes('A');
describe('crc-care-gap list and events', () => {
  it('the panel is the four base members and the lever hosts of the LEVER state', () => {
    expect(expected.items.map((x) => x.patient)).toEqual(panelOf(LEVER));
    expect(expected.items.map((x) => x.patient).slice(0, 4)).toEqual(['Patient/pt-0009', 'Patient/pt-0020', 'Patient/pt-0022', 'Patient/pt-0024']);
  });

  it('authors e_max = 4 base specs plus the lever event and its twin; ACTIVE is three amend events and one lure, plus crc-b3 while A is on; one event per item', () => {
    expect(events.SPECS.map((s) => s.id)).toEqual(['crc-b1', 'crc-b2', 'crc-o1', 'crc-d1', 'crc-b3', 'crc-d2']);
    expect([...events.ACTIVE].sort()).toEqual(['crc-b1', 'crc-b2', 'crc-d1', 'crc-o1', ...(A_ON ? ['crc-b3'] : [])].sort());
    expect(specs.filter((s) => AMEND_CLASSES.has(s.class))).toHaveLength(A_ON ? 4 : 3);
    expect(specs.filter((s) => s.class === 'D')).toHaveLength(1);
    expect(specs.some((s) => s.class === 'O')).toBe(true);
    expect(new Set(specs.map((s) => s.item)).size).toBe(specs.length);
    for (const s of specs) expect(expected.items.map((x) => x.patient), s.id).toContain(s.item);
    // The twin shares the lever event's item and never runs with it.
    expect(events.EXCLUSIVE).toEqual([['crc-b3', 'crc-d2']]);
    for (const [a, b] of events.EXCLUSIVE) expect(events.ACTIVE.includes(a) && events.ACTIVE.includes(b), `${a} with ${b}`).toBe(false);
    expect(events.SPECS.find((s) => s.id === 'crc-d2')!.item).toBe(events.SPECS.find((s) => s.id === 'crc-b3')!.item);
  });

  it('the policy states the shared sentence word for word', async () => {
    const text = (await nodeTaskSource({ testMode: false }).get('crc-care-gap')).policies[0]!.text.replace(/\s+/g, ' ');
    expect(text).toContain(POLICY_SENTENCE);
  });

  // R38(j): a result's entered-in-error status decides on its own only where the policy says so. §3,
  // on what counts, says it in one general sentence that names no member (R11), which makes the
  // withdrawn sDNA-FIT an any-of route to crc-o1 with the Harbor notice (R21).
  it('§3 says a result marked entered in error does not count toward screening', async () => {
    const text = (await nodeTaskSource({ testMode: false }).get('crc-care-gap')).policies[0]!.text;
    const s3 = text.slice(text.indexOf('§3 Screening'), text.indexOf('§4 Exclusions')).replace(/\s+/g, ' ');
    expect(s3).toContain('A result marked entered in error does not count toward screening.');
  });

  it('each trigger is after_exposed on one all-of decisive record of its item', () => {
    for (const s of specs) {
      const x = expected.items.find((m) => m.patient === s.item)!;
      expect(s.trigger.kind, s.id).toBe('after_exposed');
      if (s.trigger.kind !== 'after_exposed') continue;
      expect(x.evidence, s.id).toBe('all');
      for (const t of s.trigger.ids) {
        expect(x.decisive, s.id).toContain(t);
        expect(x.atoms[t], `${s.id}: ${t} has atoms, so a snippet could show it unexposed`).toBeUndefined();
      }
    }
  });
});

const env = matrixEnv();
const store = await loadStore(env.world);
const keyOf = (r: { resourceType: string; id?: string }) => `${r.resourceType}/${r.id}`;
// The world with one spec's arrival put in, as the hook puts it (a resource replaces one with its id).
function delivered(spec: (typeof specs)[number]): WorldView {
  const put = new Map(spec.resources.map((r) => [keyOf(r), r]));
  const all = [...[...store.resources()].map((r) => put.get(keyOf(r)) ?? r), ...spec.resources.filter((r) => store.get(r.resourceType, r.id!) === undefined)];
  return { get: (type, id) => all.find((r) => r.resourceType === type && r.id === id), all: (type) => (type === undefined ? all : all.filter((r) => r.resourceType === type)) };
}

describe('crc-care-gap events against the world', () => {
  // C1 and the double derivation: policy.ts on the chart as delivered gives each amend event's
  // member as expected.ts DELIVERED states it (status, age, order, message, the screening absences),
  // and leaves the lure's member as she was.
  it.each(specs.map((s) => [s.id, s] as const))('%s: policy.ts on the chart as delivered agrees with expected.ts', (_id, spec) => {
    const x = (derive(delivered(spec)) as unknown as typeof expected).items.find((m) => m.patient === spec.item)!;
    const want = spec.class === 'D' ? expected.items.find((m) => m.patient === spec.item)! : DELIVERED[spec.id]!;
    expect({ status: x.status, age: x.age, order: x.order, message: x.message, absences: x.absences }).toEqual({ status: want.status, age: want.age, order: want.order, message: want.message, absences: want.absences });
  });

  // A replaced record keeps every field of the world's record except the ones its correction
  // changes, so the arrival corrects the chart and contradicts nothing else in it (R8).
  it.each([
    ['crc-b1', ['clinicalStatus', 'verificationStatus', 'note']],
    ['crc-b2', ['status', 'effectiveDateTime', 'issued', 'note']],
    ['crc-o1', ['status']],
    ['crc-b3', ['status', 'issued', 'note']],
    ['crc-d2', ['status', 'issued', 'note']],
  ] as const)('%s: each record it replaces differs from the world only in %j', (id, changed) => {
    const spec = events.SPECS.find((s) => s.id === id)!;
    const replaced = spec.resources.filter((r) => store.get(r.resourceType, r.id!) !== undefined);
    expect(replaced).toHaveLength(1);
    const before = store.get(replaced[0]!.resourceType, replaced[0]!.id!) as unknown as Record<string, unknown>;
    const after = replaced[0] as unknown as Record<string, unknown>;
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]));
    expect(fields.sort()).toEqual([...changed].sort());
  });

  // Addendum 2: every route that passes an item fires its event, so no passing route grades the
  // member on the chart without the arrival. The oracle and every alternative pass, and each fires
  // every active event.
  it('the oracle and every alternative fire every active event', async () => {
    const task = await loadMatrixTask('crc-care-gap');
    const passing = cases(task).filter((c) => c.kind === 'oracle' || c.kind === 'alternative');
    expect(passing.length).toBeGreaterThan(5);
    for (const c of passing) {
      const steps = stepsOf((await trial(env, task, c)).events);
      const fired = steps.flatMap((st) => (st.arrivals ?? []).map((a) => a.spec)).sort();
      expect([c.id, fired]).toEqual([c.id, [...events.ACTIVE].sort()]);
    }
  });

  // A review that never opens a trigger record never fires its event, and its item fails at base as
  // retrieval (tests/mutants.ts *_never_opened); the null agent passes no item (R32).
  it('a review that skips a trigger record fires nothing for that item and fails it; the null agent fails every item', async () => {
    const task = await loadMatrixTask('crc-care-gap');
    const skipped = mutants.filter((m) => m.trap === 'no_contact_unreviewed');
    expect(skipped.map((m) => Object.keys(m.items!)[0]).sort()).toEqual(expected.items.filter((x) => events.SPECS.some((s) => s.item === x.patient)).map((x) => x.patient).sort());
    for (const m of skipped) {
      const item = Object.keys(m.items!)[0]!;
      // A member whose event is inactive in this state (crc-b3 with A off) fires nothing anyway.
      const spec = specs.find((s) => s.item === item);
      const run = await trial(env, task, cases(task).find((c) => c.id === m.id)!);
      expect(stepsOf(run.events).some((st) => (st.arrivals ?? []).some((a) => a.spec === spec?.id)), m.id).toBe(false);
    }
    const misses: Miss[] = [];
    const grade = await gradeRun(env, task, task.checks, await trial(env, task, cases(task).find((c) => c.kind === 'null')!), misses);
    const failed = new Set(grade.checks.filter((c) => c.kind === 'gate').flatMap((c) => ((c as { items?: Array<{ item: string; met: boolean }> }).items ?? []).filter((i) => !i.met).map((i) => i.item)));
    expect(expected.items.map((x) => x.patient).filter((p) => !failed.has(p))).toEqual([]);
  });

  // R38(b): RBC-QM-02 states no inbox rule, so an arrival's inbox status is ungraded. A trial that
  // reads each arrival and completes its inbox item passes with no rubric loss and no judge question
  // about those Tasks (also the matrix alternative completes_arrival_inbox_items).
  it('completing the arrivals\' inbox items is ungraded (R38b)', async () => {
    const task = await loadMatrixTask('crc-care-gap');
    const complete = specs.map((_s, i) => ({ name: 'update_inbox_item', input: { task_id: `inbox-a${String(i + 1).padStart(4, '0')}`, action: 'complete' } }));
    const c = { kind: 'alternative' as const, id: 'completes_arrival_inbox_items', loses: [], script: [...reads(), recheck, arrivals(), { calls: complete }, { calls: actions(undefined, specs.length + 1) }, { calls: [finish()] }] };
    const run = await trial(env, task, c);
    expect(stepsOf(run.events).filter((st) => st.tool === 'update_inbox_item' && !st.is_error)).toHaveLength(specs.length);
    const misses: Miss[] = [];
    const grade = await gradeRun(env, task, task.checks, run, misses);
    expect(misses).toEqual([]);
    expect([grade.outcome, grade.score]).toEqual(['PASS', 1]);
  });
});

// The A-twin (events.ts crc-d2; plan-amendment-w5 G4), matrix only: run alone, in place of crc-b3,
// with the task's checks built for it. The same packet shape with the re-issued FIT keeping its 2026
// collection date: the oracle's route and the cover-only route both leave her and pass; a FIT order
// or a message on the packet fails kept (over_action); the cover never read fails event_seen.
function withActive(ids: readonly string[]): { env: MatrixEnv; task: MatrixTask } {
  const active = activeSpecs({ SPECS: events.SPECS, ACTIVE: ids });
  const base = env;
  const tasks: TaskSource = {
    all: async () => (await base.tasks.all()).map((t: Task) => (t.id === 'crc-care-gap' ? { ...t, events: active } : t)),
    get: async (id: string) => {
      const t = await base.tasks.get(id);
      return id === 'crc-care-gap' ? { ...t, events: active } : t;
    },
  };
  return { env: { ...base, tasks }, task: { ...twinTask, events: active, checks: checksFor(active) } };
}
const twinTask = await loadMatrixTask('crc-care-gap');
// Under the twin the final table is the twin oracle's (Marisol Quintero's base row), a text the
// committed judge cache (filled for the LEVER states, never for the matrix-only twin) does not
// hold, so every table item's question is a miss here: the table items are left out of these
// cases' rubric checks, the gates being what they test.
const TWIN_MISS = (check: string) => check.startsWith('table_');
async function runOn(at: { env: MatrixEnv; task: MatrixTask }, kind: 'oracle' | 'alternative' | 'mutant' | 'null', id: string, script: Script) {
  const r = await trial(at.env, at.task, { kind, id, script });
  const misses: Miss[] = [];
  const grade = await gradeRun(at.env, at.task, at.task.checks, r, misses);
  expect(misses.filter((m) => !TWIN_MISS(m.check))).toEqual([]);
  const fired = stepsOf(r.events).flatMap((s) => (s.arrivals ?? []).map((a) => a.spec));
  const items = Object.fromEntries((grade.attribution?.items ?? []).map((i) => [i.item, i.auto]));
  const failedItems = (gate: string) => (grade.checks.find((c) => c.id === gate)?.items ?? []).filter((i) => !i.met).map((i) => i.item);
  return { grade, fired, items, failedItems };
}
const TWIN_ACTIVE = ['crc-b1', 'crc-b2', 'crc-o1', 'crc-d1', 'crc-d2'];
describe.runIf(A_ON)('crc-d2, the A-twin, active in place of crc-b3', () => {
  const at = withActive(TWIN_ACTIVE);
  const item = `Patient/${PT.Q}`;
  const gapsButQ = GAPS.filter((l) => l !== 'Q');
  // The twin leaves her screening up to date: the route reads the cover and acts on the others.
  const leave: Script = [...reads(), recheck, { calls: [...arrivals(['G1', 'D1', 'A1', 'C2']).calls, { name: 'fhir_read', input: { resource_type: 'DocumentReference', id: events.REISSUED.twinCover } }] }, { calls: actions(gapsButQ) }, { calls: [finish(TWIN_TABLE)] }];

  it('the cover-only route passes and fires it, with no gate failed and no rubric item lost (the notified cover decides, R1)', async () => {
    const r = await runOn(at, 'alternative', 'twin_cover_only', leave);
    expect(r.grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id)).toEqual([]);
    expect(r.grade.outcome).toBe('PASS');
    expect(r.grade.checks.filter((c) => c.kind === 'rubric' && !TWIN_MISS(c.id) && ((c.points! > 0 && c.met === false) || (c.points! < 0 && c.met === true))).map((c) => c.id)).toEqual([]);
    expect(r.fired.sort()).toEqual([...TWIN_ACTIVE].sort());
  });

  it('the same route with her stool tests listed again passes too (the re-issued FIT counts)', async () => {
    const r = await runOn(at, 'alternative', 'twin_relisted', [...reads(), recheck, { calls: [...arrivals(['G1', 'D1', 'A1', 'C2']).calls, { name: 'fhir_read', input: { resource_type: 'DocumentReference', id: events.REISSUED.twinCover } }, { name: 'fhir_search', input: { resource_type: 'Observation', patient: PT.Q, code: '29771-3' } }] }, { calls: actions(gapsButQ) }, { calls: [finish(TWIN_TABLE)] }]);
    expect(r.grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id)).toEqual([]);
    expect(r.grade.outcome).toBe('PASS');
  });

  it.each(twinMutants.map((m) => [m.id, m] as const))('mutant %s fails only her item, on its gate, under its label', async (mid, m) => {
    const r = await runOn(at, 'mutant', mid, m.script);
    const kind = EVENT_MUTANTS[m.event!.kind]!;
    expect(r.grade.outcome).toBe('FAIL');
    expect(r.items).toEqual({ [item]: kind.label });
    expect(r.failedItems(kind.gate)).toEqual([item]);
    expect(r.grade.checks.filter((c) => c.kind === 'gate' && !c.met).map((c) => c.id).sort()).toEqual([...m.fails].sort());
  });

  it('policy.ts on the chart as the twin delivers it leaves her up to date', () => {
    const x = (derive(delivered(events.SPECS.find((s) => s.id === 'crc-d2')!)) as unknown as typeof expected).items.find((m) => m.patient === item)!;
    expect([x.status, x.order, x.message]).toEqual(['met', false, false]);
  });

  it('the null agent passes no item with the twin active either (R32)', async () => {
    const n = await runOn(at, 'null', 'null', NULL_AGENT);
    const failed = new Set(n.grade.checks.flatMap((c) => (c as { items?: Array<{ item: string; met: boolean }> }).items ?? []).filter((i) => !i.met).map((i) => i.item));
    for (const p of expected.items.map((x) => x.patient)) expect(failed.has(p), p).toBe(true);
  });
});
