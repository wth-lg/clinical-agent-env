// The grader side of mid-trial events (plan-amendment-w4 PW4-E1 stage 2; gate (c) to (g)):
//   (c) an arrival is found where a clinician finds it: its result by fhir_read and its Task by
//       list_inbox (the toy reads its arrivals by id; packages/env/test/events.test.ts covers
//       search_notes and list_inbox);
//   (e) arrivals are in diff.arrived, never in diff.created, diff.updated or any written_ids, and an
//       arrived DocumentReference is never one of the agent's notes;
//   (f) every _toy event mutant fails only the toy's event item, on its gate and under its label,
//       and the toy's event alternative passes; the matrix refuses a task whose active spec lacks a
//       required mutant or an event gate;
//   (g) a suppressed delivery grades ENV_ERROR, and E9 holds; an arrival in the model's last turn
//       fails had_turn, and E10 holds;
//   and a class B correction that replaces a record read before it arrived is seen only by a read
//   after it (seen_at_only): never read again, its item is retrieval, not reasoning. A task with no
//   active specs gets no event gates.
import { describe, expect, it } from 'vitest';
import { withEvents } from '../../core/test/event-tasks.ts';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { repoWorld } from '../../../cli/run.ts';
import { FAULT_DEFINITIONS, type AttributionFacts } from '../../core/outcomes.ts';
import { run } from '../../core/run.ts';
import type { EventSpec } from '../../env/events.ts';
import { attribute } from '../attribution.ts';
import { gate, rubric, type Check, type GateCtx, type Note, type Step } from '../check.ts';
import { diff } from '../diff.ts';
import { eventGates } from '../events.ts';
import type { CheckResult } from '../grade.ts';
import { eventDeclarations, scriptedClient } from '../matrix/matrix.ts';
import type { Script } from '../matrix/types.ts';
import { matrix, ONE, TOY } from '../../grader/matrix/test/harness.ts';
import { checks as TOY_CHECKS } from '../../../tasks/_toy/tests/grader.ts';
import { alternatives } from '../../../tasks/_toy/tests/alternatives.ts';
import { oracle } from '../../../tasks/_toy/solution/solve.ts';

const { world, worldHash, definitions } = repoWorld();
const tasks = nodeTaskSource({ testMode: true });
const EVENT_HANDLED = alternatives.find((a) => a.id === 'event_handled')!.script;

const trial = (script: Script, opts: { tasks?: typeof tasks; checks?: readonly Check[] } = {}) =>
  run('_toy', 'claude-opus-5-5', { tasks: opts.tasks ?? tasks, client: scriptedClient(script, 'items-events'), world, worldHash, definitions, now: () => 0, checks: opts.checks ?? TOY_CHECKS, judge: null });

describe('diff.arrived (e)', () => {
  const obs = (id: string, value: number) => ({ resourceType: 'Observation', id, status: 'final', code: { text: 'k' }, valueQuantity: { value } }) as never;
  it('lists arrivals apart: an arrived new record and an amended one are in arrived, never created or updated', () => {
    const d = diff([obs('a', 1), obs('b', 1)], [obs('a', 2), obs('b', 1), obs('c', 1), obs('n', 1)], ['Observation/a', 'Observation/c']);
    expect(d).toEqual({ created: ['Observation/n'], updated: [], status_changed: [], arrived: ['Observation/a', 'Observation/c'] });
  });
  it('is unchanged with no arrivals', () => {
    expect(diff([obs('a', 1)], [obs('a', 2)])).toEqual({ created: [], updated: ['Observation/a'], status_changed: [], arrived: [] });
  });

  it('an arrived DocumentReference is no note of the agent, and no arrival is in written_ids', async () => {
    const doc = {
      resourceType: 'DocumentReference', id: 'doc-evt-out', status: 'current', subject: { reference: 'Patient/pt-0001' },
      type: { coding: [{ system: 'http://loinc.org', code: '34133-9', display: 'Summary of episode note' }] },
      description: 'Outside report', content: [{ attachment: { contentType: 'text/plain', data: btoa('Faxed outside report.') } }],
    };
    const spec: EventSpec = { id: 'evt-doc', item: 'note', class: 'O', trigger: { kind: 'after_exposed', ids: ['Patient/pt-0001'] }, resources: [doc as never], stampFields: ['DocumentReference/doc-evt-out.date'] };
    let seen: { diff?: GateCtx['diff']; notes?: readonly Note[] } = {};
    const probe: Check[] = [
      gate({ id: 'probe_diff', category: 'action', traces_to: 'instruction.md:5', decisive_ids: [], fn: (ctx) => ((seen.diff = ctx.diff), { met: true, evidence: {} }) }),
      rubric({ id: 'probe_notes', category: 'documentation', points: 1, method: 'code', traces_to: 'instruction.md:5', decisive_ids: [], fn: (ctx) => ((seen.notes = ctx.notes), { met: true, evidence: {} }) }),
    ];
    seen = {};
    const { record, events } = await trial(oracle, { tasks: withEvents(tasks, '_toy', [spec]), checks: probe });
    expect(record.outcome).toBe('PASS');
    const keys = ['DocumentReference/doc-evt-out', 'Task/inbox-a0001'];
    expect(seen.diff!.arrived).toEqual(keys);
    for (const k of keys) {
      expect(seen.diff!.created).not.toContain(k);
      expect(seen.diff!.updated).not.toContain(k);
    }
    expect(seen.notes!.map((n) => n.id)).toEqual(['DocumentReference/doc-t0001']);
    const written = events.flatMap((e) => (e.type === 'tool_result' ? (e.written_ids ?? []) : []));
    for (const k of keys) expect(written).not.toContain(k);
  });
});

describe('the toy event cases (f)', () => {
  const EVENT_CASES = ['event_handled', ...TOY.mutants.filter((m) => m.event !== undefined).map((m) => m.id)];

  it('has the four required near misses for its amend event and its lure, and one event alternative', () => {
    expect(TOY.mutants.filter((m) => m.event).map((m) => [m.event!.spec, m.event!.kind]).sort()).toEqual([
      ['toy-a1', 'before_seen'], ['toy-a1', 'not_amended'], ['toy-a1', 'unseen'], ['toy-d1', 'lure_acted_on'], ['toy-d1', 'unseen'],
    ]);
    expect(eventDeclarations(TOY)).toEqual([]);
  });

  it('every event mutant fails only the item note, on its gate under its label, and the event alternative passes', { timeout: 120_000 }, async () => {
    const { code, text } = await matrix({}, { ...ONE, cases: EVENT_CASES });
    expect(code, text).toBe(0);
    expect(text).toContain('alternative event_handled: PASS score 1.000');
    for (const m of TOY.mutants.filter((x) => x.event)) {
      const line = text.split('\n').find((l) => l.includes(`mutant ${m.id} `))!;
      expect(line, text).toMatch(/ ok$/);
      expect(line).toContain(`items {note ${m.items!.note}}`);
    }
    expect(text).toMatch(/events: 2 active \(toy-a1 A, toy-d1 D\), 5 event mutants, arrivals in 6\/6 cases, arrived split checked/);
  });

  it('the matrix refuses a missing required mutant, a mislabelled one and an active spec no event gate grades', () => {
    const without = { ...TOY, mutants: TOY.mutants.filter((m) => m.id !== 'event_cited_before_read') };
    expect(eventDeclarations(without)).toEqual(['active event toy-a1 has no before_seen mutant']);
    const mislabelled = { ...TOY, mutants: TOY.mutants.map((m) => (m.id === 'event_lure_cited' ? { ...m, items: { note: 'reasoning' as const } } : m)) };
    expect(eventDeclarations(mislabelled)).toEqual(['mutant event_lure_cited: an event lure_acted_on mutant must declare item note as over_action']);
    const ungraded = { ...TOY, checks: TOY.checks.filter((c) => c.id !== 'kept') };
    expect(eventDeclarations(ungraded)).toEqual(['active event toy-d1 is not graded by an event gate kept (packages/grader/events.ts eventGates)']);
  });

  it('the toy\'s own cases never fire: its oracle grades with every event gate met, the specs not fired', async () => {
    const { record, events } = await trial(oracle);
    expect(events.some((e) => e.type === 'env_event')).toBe(false);
    expect(record.outcome).toBe('PASS');
    const gates = (record.checks ?? []).filter((c) => ['event_delivered', 'had_turn', 'event_seen', 'amended', 'kept'].includes(c.id));
    expect(gates.map((c) => c.id)).toEqual(['event_delivered', 'had_turn', 'event_seen', 'amended', 'kept']);
    for (const c of gates) expect(c.items).toEqual([{ item: 'note', met: true, decisive_ids: expect.any(Array), evidence: { fired: [], not_fired: c.id === 'amended' ? ['toy-a1'] : c.id === 'kept' ? ['toy-d1'] : ['toy-a1', 'toy-d1'] } }]);
  });

  it('a trigger that holds again later fires nothing more: one env_event per spec', async () => {
    const again: Script = [EVENT_HANDLED[0]!, { calls: [...EVENT_HANDLED[1]!.calls, { name: 'fhir_read', input: { resource_type: 'Condition', id: 'cond-00002' } }] }, ...EVENT_HANDLED.slice(2)];
    const { record, events } = await trial(again);
    expect(events.flatMap((e) => (e.type === 'env_event' ? [e.spec] : []))).toEqual(['toy-a1', 'toy-d1']);
    expect(record.outcome).toBe('PASS');
  });
});

describe('E9 and E10 (g)', () => {
  const criterion = (id: string) => FAULT_DEFINITIONS.env.criteria.find((c) => c.id === id)!;
  const facts = (record: { checks?: ReadonlyArray<{ id: string; kind?: string; met: unknown }> | null }) => ({ failed_gates: (record.checks ?? []).filter((c) => c.kind === 'gate' && c.met === false).map((c) => c.id) }) as unknown as AttributionFacts;

  it('a delivery the environment suppressed grades ENV_ERROR, naming event_delivered, and E9 holds', async () => {
    const { record } = await trial(EVENT_HANDLED, { tasks: withEvents(tasks, '_toy', []) });
    expect(record.outcome).toBe('ENV_ERROR');
    expect(record.valid).toBe(false);
    expect(record.error).toMatchObject({ check: 'event_delivered', message: expect.stringMatching(/^undelivered event \(E9\): the trigger of event toy-a1 held at step 3 and nothing arrived/) });
    expect(criterion('E9').check(facts(record)).met).toBe(true);
    expect(criterion('E9').check(facts({ checks: [] })).met).toBe(false);
  });

  it('an arrival in the model\'s last turn fails had_turn, and E10 holds', () => {
    const steps: Step[] = [step(1, 1, { exposed_ids: ['Condition/cond-00002'], arrivals: [{ spec: 'toy-a1', keys: ['Observation/obs-toy-a1', 'Task/inbox-a0001'] }, { spec: 'toy-d1', keys: ['Observation/obs-toy-d1', 'Task/inbox-a0002'] }] })];
    const r = run1(TOY_CHECKS.find((c) => c.id === 'had_turn')!, ctxOf(steps, 1));
    expect(r.met).toBe(false);
    expect(r.items![0]).toMatchObject({ item: 'note', met: false, event: 'toy-a1' });
    const e10 = (outcome: string, failed: string[]) => criterion('E10').check({ outcome, failed_gates: failed } as unknown as AttributionFacts).met;
    // A trial that finished, whose only failures are the last-turn arrival's: the environment's.
    expect(e10('FAIL', ['had_turn', 'event_seen'])).toBe(true);
    // A LIMIT trial keeps its LIMIT fault: a looping model never reads as an environment fault.
    expect(e10('LIMIT', ['had_turn', 'event_seen'])).toBe(false);
    expect(criterion('E10').check({ outcome: 'LIMIT', failed_gates: ['had_turn'] } as unknown as AttributionFacts).evidence).toMatch(/LIMIT/);
    // Another failure besides the arrival's: the model's, by its own gates.
    expect(e10('FAIL', ['had_turn', 'note_on_patient'])).toBe(false);
    expect(run1(TOY_CHECKS.find((c) => c.id === 'had_turn')!, ctxOf(steps, 2)).met).toBe(true);
  });
});

// A gate run on a hand-built context, as grade.ts would.
const run1 = (c: Check, ctx: GateCtx) => (c as Extract<Check, { kind: 'gate' }>).fn(ctx);
function step(n: number, turn: number, over: Partial<Step> = {}): Step {
  return { n, seq: n, turn, tool: 'fhir_read', is_error: false, error_code: null, exposed_ids: [], referenced_ids: [], written_ids: [], shown: {}, ...over };
}
function ctxOf(steps: Step[], lastTurn: number): GateCtx {
  const all = { has: () => true, status: () => null, get: () => undefined, all: () => [] } as unknown as GateCtx['final'];
  return { initial: all, final: all, diff: { created: [], updated: [], status_changed: [], arrived: [] }, steps, exposedAt: () => null, writes: () => [], last_turn: lastTurn };
}

describe('a class B correction (seen_at_only)', () => {
  const CORRECTED: EventSpec = {
    id: 'b-1', item: 'k', class: 'B', trigger: { kind: 'after_exposed', ids: ['Observation/obs-k'] }, stampFields: [],
    resources: [{ resourceType: 'Observation', id: 'obs-k', status: 'corrected', code: { text: 'k' }, subject: { reference: 'Patient/pt-0001' } } as never],
  };
  const gates = eventGates([CORRECTED], { 'b-1': { amended: () => ({ met: false, writes: [] }) } }, 'POL §1');
  const grade = (steps: Step[]) => {
    const results: CheckResult[] = gates.map((g) => {
      const v = (g as Extract<Check, { kind: 'gate' }>).fn(ctxOf(steps, 9));
      return { id: g.id, kind: 'gate', method: 'code', category: g.category, points: null, met: v.met, evidence: v.evidence, ...(v.items ? { items: [...v.items] } : {}) };
    });
    return attribute('FAIL', gates as never, results, steps);
  };

  it('read before it arrived and never after: the item is retrieval', () => {
    const steps = [step(1, 1, { exposed_ids: ['Observation/obs-k'], arrivals: [{ spec: 'b-1', keys: ['Observation/obs-k', 'Task/inbox-a0001'] }] }), step(2, 2)];
    const a = grade(steps);
    expect(a!.items).toEqual([expect.objectContaining({ item: 'k', gate: 'event_seen', auto: 'retrieval' })]);
  });

  it('read again after it arrived: the item fails only amended, and is reasoning', () => {
    const steps = [step(1, 1, { exposed_ids: ['Observation/obs-k'], arrivals: [{ spec: 'b-1', keys: ['Observation/obs-k', 'Task/inbox-a0001'] }] }), step(2, 2, { exposed_ids: ['Observation/obs-k'] })];
    const a = grade(steps);
    expect(a!.items).toEqual([expect.objectContaining({ item: 'k', gate: 'amended', auto: 'reasoning' })]);
  });

  it('no active specs, no event gates', () => {
    expect(eventGates([], {}, 'POL §1')).toEqual([]);
  });
});
