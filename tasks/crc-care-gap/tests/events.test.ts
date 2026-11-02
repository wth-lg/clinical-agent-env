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
import { cases, gradeRun, trial, type Miss } from '../../../packages/grader/matrix/matrix.ts';
import type { WorldView } from '../../../packages/grader/matrix/types.ts';
import * as events from '../events.ts';
import { DELIVERED, expected } from '../expected.ts';
import { derive } from '../policy.ts';
import { actions, arrivals, finish, reads, recheck } from '../solution/steps.ts';
import { mutants } from './mutants.ts';

// plan-amendment-w4, Event mechanism table, row "Policy sentence": the same in all six policies.
export const POLICY_SENTENCE =
  'Results, corrections and messages can arrive in your queues while you work. Before you finish, review anything that arrived after you started. ' +
  'If it changes a decision you already recorded under this protocol, correct that decision (change, hold or stop the order, or send a corrected message) and record why. ' +
  'If it does not change the decision under this protocol, leave the decision in place.';

const specs = activeSpecs(events);

describe('crc-care-gap list and events', () => {
  it('cuts the panel to four members', () => {
    expect(expected.items.map((x) => x.patient)).toEqual(['Patient/pt-0009', 'Patient/pt-0020', 'Patient/pt-0022', 'Patient/pt-0024']);
  });

  it('authors e_max = 4 specs, all active: three amend events and one lure, one event per item', () => {
    expect(events.SPECS).toHaveLength(4);
    expect([...events.ACTIVE].sort()).toEqual(events.SPECS.map((s) => s.id).sort());
    expect(specs.filter((s) => AMEND_CLASSES.has(s.class))).toHaveLength(3);
    expect(specs.filter((s) => s.class === 'D')).toHaveLength(1);
    expect(specs.some((s) => s.class === 'O')).toBe(true);
    expect(new Set(specs.map((s) => s.item)).size).toBe(4);
    for (const s of specs) expect(expected.items.map((x) => x.patient), s.id).toContain(s.item);
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
  ] as const)('%s: each record it replaces differs from the world only in %j', (id, changed) => {
    const spec = specs.find((s) => s.id === id)!;
    const replaced = spec.resources.filter((r) => store.get(r.resourceType, r.id!) !== undefined);
    expect(replaced).toHaveLength(1);
    const before = store.get(replaced[0]!.resourceType, replaced[0]!.id!) as unknown as Record<string, unknown>;
    const after = replaced[0] as unknown as Record<string, unknown>;
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]));
    expect(fields.sort()).toEqual([...changed].sort());
  });

  // Addendum 2: every route that passes an item fires its event, so no passing route grades the
  // member on the chart without the arrival. The oracle and every alternative pass, and each fires
  // all four events.
  it('the oracle and every alternative fire all four events', async () => {
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
    expect(skipped.map((m) => Object.keys(m.items!)[0]).sort()).toEqual(expected.items.map((x) => x.patient).sort());
    for (const m of skipped) {
      const item = Object.keys(m.items!)[0]!;
      const spec = specs.find((s) => s.item === item)!;
      const run = await trial(env, task, cases(task).find((c) => c.id === m.id)!);
      expect(stepsOf(run.events).some((st) => (st.arrivals ?? []).some((a) => a.spec === spec.id)), m.id).toBe(false);
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
    const complete = ['inbox-a0001', 'inbox-a0002', 'inbox-a0003', 'inbox-a0004'].map((task_id) => ({ name: 'update_inbox_item', input: { task_id, action: 'complete' } }));
    const c = { kind: 'alternative' as const, id: 'completes_arrival_inbox_items', loses: [], script: [...reads(), recheck, arrivals(), { calls: complete }, { calls: actions(undefined, 5) }, { calls: [finish()] }] };
    const run = await trial(env, task, c);
    expect(stepsOf(run.events).filter((st) => st.tool === 'update_inbox_item' && !st.is_error)).toHaveLength(4);
    const misses: Miss[] = [];
    const grade = await gradeRun(env, task, task.checks, run, misses);
    expect(misses).toEqual([]);
    expect([grade.outcome, grade.score]).toEqual(['PASS', 1]);
  });
});
