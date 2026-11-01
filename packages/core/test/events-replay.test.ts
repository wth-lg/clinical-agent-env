// Mid-trial events through run(), replay and gradeTrajectory (plan-amendment-w4 PW4-E1 stage 1).
//   (a) With no active specs, every probe-1 record grades through gradeTrajectory to its recorded
//       outcome, score and check results byte for byte, and the same comparison fails when
//       delivery is forced on. The records are results/probe-1 (PR #194; from the commit that
//       holds them, or CLINENV_PROBE1_DIR pointing at a copy). The test fails, never skips, when
//       they are missing.
//   (b) One scripted trial with an event, run twice, gives the same trajectory (fired lists,
//       stamps, ids, state hashes); replay agrees; the agent's -t<n> ids are gap-free.
//   (d) finish answers CONFLICT in the turn an event fired, and the trial goes on.
//   An env_event that replay does not reproduce ends run() ENV_ERROR replay_mismatch and grades
//   GRADER_ERROR in gradeTrajectory.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scriptedTransport, type MockTurn } from '../../../apps/web/src/harness/scenarios.ts';
import { settledRecords, trajectoryOf } from '../../../cli/adapters/result-sink-node.ts';
import { nodeTaskSource } from '../../../cli/adapters/tasks-node.ts';
import { repoWorld, taskChecks } from '../../../cli/run.ts';
import { clock } from '../../env/clock.ts';
import { FINISH_GUARD_MESSAGE, type EventSpec } from '../../env/events.ts';
import type { Resource } from '../../env/store.ts';
import { MessagesClient } from '../anthropic.ts';
import type { EnvEvent, ToolResultEvent, TrialEvent } from '../events.ts';
import { admitStore, createLedger, type LedgerRow, type LedgerStore } from '../ledger.ts';
import { gradeTrajectory, run, type RunOptions, type TrialRecord } from '../run.ts';
import { currentGrade } from '../summary.ts';
import { isEnvFile, parseTask, taskVersions } from '../tasks.ts';
import { parseTrajectory, stripTimestamps, toJsonl } from '../trajectory.ts';
import { withEvents } from './event-tasks.ts';

const root = new URL('../../../', import.meta.url);
const { world, worldHash, definitions } = repoWorld();
const tasks = nodeTaskSource({ testMode: true });

class MemoryStore implements LedgerStore {
  rows: LedgerRow[] = [];
  async transact<T>(fn: (rows: readonly LedgerRow[]) => { append: LedgerRow[]; result: T }): Promise<T> {
    const { append, result } = fn(this.rows);
    this.rows.push(...append);
    return result;
  }
  async read(): Promise<LedgerRow[]> {
    return [...this.rows];
  }
}

const creatinine = {
  resourceType: 'Observation',
  id: 'obs-evt-toy-1',
  status: 'final',
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
  code: { coding: [{ system: 'http://loinc.org', code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma' }] },
  subject: { reference: 'Patient/pt-0001' },
  effectiveDateTime: '2026-10-23T07:30:00-04:00',
  valueQuantity: { value: 2.4, unit: 'mg/dL', system: 'http://unitsofmeasure.org', code: 'mg/dL' },
} as Resource;
const TOY_EVENT: EventSpec = {
  id: 'evt-toy', item: 'note', class: 'A', trigger: { kind: 'after_write', patient: 'pt-0001' }, resources: [creatinine], stampFields: ['Observation/obs-evt-toy-1.issued'],
};
const ARRIVAL_KEYS = ['Observation/obs-evt-toy-1', 'Task/inbox-a0001'];

const note = (id: string, title: string) => ({ id, name: 'write_note', input: { patient: 'pt-0001', type: 'progress_note', title, text: 'Chart opened by Maya Okafor, MD.', cites: ['Patient/pt-0001'] } });
const finish = (id: string) => ({ id, name: 'finish', input: { summary: 'Wrote two progress notes on the chart of Walter Kowalczyk.' } });
// Turn 2's note fires the event, so turn 2's finish is refused; turn 3 writes again and finishes.
const SCRIPT: MockTurn[] = [
  { tools: [{ id: 'toolu_e1', name: 'get_context', input: {} }, { id: 'toolu_e2', name: 'fhir_read', input: { resource_type: 'Patient', id: 'pt-0001' } }] },
  { tools: [note('toolu_e3', 'First'), finish('toolu_e4')] },
  { tools: [note('toolu_e5', 'Second'), finish('toolu_e6')] },
];

async function toyTrial(over: Partial<RunOptions> = {}, specs: readonly EventSpec[] = [TOY_EVENT]) {
  const store = new MemoryStore();
  admitStore(store);
  let id = 0;
  const ledger = createLedger({ store, clock: { now: () => 't' }, newId: () => `id-${++id}`, source: 'node', runId: null, pid: 1, host: 'h', isAlive: () => true });
  const grant = await ledger.batchStart(6);
  const transport = scriptedTransport(SCRIPT).transport;
  let now = Date.UTC(2026, 9, 23, 12);
  const client = new MessagesClient({ grant, ledger, apiKey: 'test-key-not-real', fetch: (q) => ((now += 4000), transport(q)), sleep: async () => {} });
  return run('_toy', 'claude-opus-5-5', {
    tasks: withEvents(tasks, '_toy', specs), client, world, worldHash, definitions, now: () => now, checks: [], judge: null, ...over,
  });
}

const regrade = (events: readonly TrialEvent[], record: TrialRecord, eventSpecs?: readonly EventSpec[]) =>
  gradeTrajectory('_toy', { tasks: eventSpecs ? withEvents(tasks, '_toy', eventSpecs) : tasks, world, definitions, checks: [], events, record });

describe('isEnvFile', () => {
  it('counts a task events.ts as an env file: it moves env_version, not grader_task_version', async () => {
    expect(isEnvFile('events.ts')).toBe(true);
    const files = { 'task.toml': '[task]\nid = "x"\ntitle = "X"\n', 'instruction.md': 'Do it.' };
    const [a, b] = await Promise.all([parseTask({ id: 'x', files }), parseTask({ id: 'x', files: { ...files, 'events.ts': 'export const SPECS = []; export const ACTIVE = [];' }, events: { SPECS: [], ACTIVE: [] } })]);
    const [va, vb] = await Promise.all([taskVersions(a, worldHash), taskVersions(b, worldHash)]);
    expect(vb.env_version).not.toBe(va.env_version);
    expect(vb.grader_task_version).toBe(va.grader_task_version);
  });
});

describe('an event in a run() trial', () => {
  it('fires once, after the trigger write, as an env_event; arrivals are in no written_ids; ids stay gap-free', async () => {
    const { record, events } = await toyTrial();
    expect(record.status).toBe('COMPLETED');
    expect(record.stop).toBe('finish');
    const env = events.filter((e): e is EnvEvent => e.type === 'env_event');
    expect(env.map(({ v: _v, seq: _s, ts: _t, ...rest }) => rest)).toEqual([
      { type: 'env_event', turn: 2, tool_use_id: 'toolu_e3', spec: 'evt-toy', arrival_seq: 1, stamp: clock.arrivalStamp(1, 1), keys: ARRIVAL_KEYS },
    ]);
    // After the trigger's tool_result, before its write hash (which includes the arrival).
    const at = (p: (e: TrialEvent) => boolean) => events.findIndex(p);
    const result = at((e) => e.type === 'tool_result' && e.tool_use_id === 'toolu_e3');
    const hash = at((e) => e.type === 'state_hash' && e.tool_use_id === 'toolu_e3');
    expect(result < env[0]!.seq && env[0]!.seq < hash).toBe(true);
    const results = events.filter((e): e is ToolResultEvent => e.type === 'tool_result');
    for (const r of results) for (const k of ARRIVAL_KEYS) expect(r.written_ids ?? []).not.toContain(k);
    expect(JSON.stringify(results.map((r) => r.content))).not.toMatch(/obs-evt-toy|inbox-a/);
    const written = results.flatMap((r) => r.written_ids ?? []).filter((k) => k.startsWith('Provenance/'));
    expect(written).toEqual(['Provenance/prov-t0001', 'Provenance/prov-t0002']);
    expect(record.state_hash.replay_final).toBe(record.state_hash.final);
    // The trajectory parses back, env_event included.
    expect(parseTrajectory(toJsonl(events))).toHaveLength(events.length);
  });

  it('finish answers CONFLICT in the turn the event fired, and the trial goes on to a later finish', async () => {
    const { record, events } = await toyTrial();
    const r = (id: string) => events.find((e): e is ToolResultEvent => e.type === 'tool_result' && e.tool_use_id === id)!;
    expect(r('toolu_e4')).toMatchObject({ turn: 2, executed: true, is_error: true, error_code: 'CONFLICT', content: { error: { code: 'CONFLICT', message: FINISH_GUARD_MESSAGE } } });
    expect(r('toolu_e6')).toMatchObject({ turn: 3, is_error: false });
    expect(record.turns).toBe(3);
    expect(record.summary).toMatch(/two progress notes/);
  });

  it('two runs of the same trial give the same trajectory: fired lists, stamps, ids and state hashes', async () => {
    const [a, b] = await Promise.all([toyTrial(), toyTrial()]);
    expect(stripTimestamps(toJsonl(a.events))).toBe(stripTimestamps(toJsonl(b.events)));
  });

  it('without the spec the same script fires nothing, and its turn-2 finish ends the trial', async () => {
    const { record, events } = await toyTrial({}, []);
    expect(events.some((e) => e.type === 'env_event')).toBe(false);
    expect(record.turns).toBe(2);
  });

  it('an env_event replay does not reproduce ends the trial ENV_ERROR replay_mismatch', async () => {
    const { record } = await toyTrial({
      onEvent: (e) => {
        if (e.type === 'env_event') (e as { stamp: string }).stamp = '2026-10-23T08:00:09.000-04:00';
      },
    });
    expect(record.status).toBe('ENV_ERROR');
    expect(record.detail).toBe('replay_mismatch');
  });
});

describe('gradeTrajectory re-derives firing', () => {
  it('regrades the trial with its specs to its recorded grade, and GRADER_ERROR without them or on a disagreeing env_event', async () => {
    const { record, events } = await toyTrial();
    const same = await regrade(events, record, [TOY_EVENT]);
    expect([same.outcome, same.score, same.error]).toEqual([record.outcome, record.score, null]);
    const without = await regrade(events, record);
    expect(without.outcome).toBe('GRADER_ERROR');
    expect(without.error?.message).toMatch(/env_event/);
    const tampered = events.map((e) => (e.type === 'env_event' ? { ...e, keys: ['Observation/other'] } : e));
    const bad = await regrade(tampered, record, [TOY_EVENT]);
    expect(bad.outcome).toBe('GRADER_ERROR');
    expect(bad.error?.message).toMatch(/env_event/);
  });
});

// (a) probe-1.
const PROBE = process.env.CLINENV_PROBE1_DIR ?? fileURLToPath(new URL('results/probe-1', root));

type Graded = { outcome: string; score: number | null; checks: unknown };
const gradeKey = (g: Graded) => JSON.stringify({ outcome: g.outcome, score: g.score, checks: g.checks });

// Every probe-1 record whose regrade with `specsFor` differs from its current grade, by trial.
async function probeMismatches(specsFor: (events: readonly TrialEvent[]) => readonly EventSpec[]): Promise<{ n: number; differ: string[] }> {
  const records = settledRecords(PROBE);
  const differ: string[] = [];
  for (const { record: r } of records) {
    const events = parseTrajectory(readFileSync(trajectoryOf(PROBE, r), 'utf8'));
    const graded = await gradeTrajectory(r.task_id, { tasks: withEvents(tasks, r.task_id, specsFor(events)), world, definitions, checks: await taskChecks(r.task_id), events, record: r as never });
    const cur = currentGrade(r as never);
    if (gradeKey(graded) !== gradeKey({ outcome: cur.outcome, score: cur.score, checks: cur.checks })) differ.push(`${r.task_id}/${r.index}: ${graded.outcome} ${graded.error?.message ?? ''}`);
  }
  return { n: records.length, differ };
}

// A spec that fires on the first id the trajectory's first successful read exposed.
const forced = (events: readonly TrialEvent[]): EventSpec[] => {
  const first = events.find((e): e is ToolResultEvent => e.type === 'tool_result' && !e.is_error && e.exposed_ids.length > 0)!;
  return [{ ...TOY_EVENT, id: 'evt-forced', trigger: { kind: 'after_exposed', ids: [first.exposed_ids[0]!] } }];
};

describe('probe-1 with no active specs (a)', () => {
  it('finds the 36 probe-1 records', () => {
    expect(existsSync(join(PROBE, 'trials')), `no probe-1 records at ${PROBE}: set CLINENV_PROBE1_DIR to a copy of results/probe-1 (631695f5)`).toBe(true);
    expect(settledRecords(PROBE)).toHaveLength(36);
  });

  it('every record grades byte-identically to its current grade', async () => {
    expect(await probeMismatches(() => [])).toEqual({ n: 36, differ: [] });
  }, 600_000);

  it('and the comparison fails on every record when delivery is forced on', async () => {
    const { n, differ } = await probeMismatches(forced);
    expect(n).toBe(36);
    expect(differ).toHaveLength(36);
  }, 600_000);
});
