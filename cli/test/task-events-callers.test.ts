// Every caller gets the task's mid-trial event specs from the task (plan-amendment-w4 Correction 2,
// PW4-E1 stage 2): run, run-one, replay, regrade, judge-calibrate and the matrix read the specs
// tasks/<id>/events.ts carries through the TaskSource, never from an option. Each test drives one
// caller on the toy's event route (scenario toyEvent: opening problem cond-00002 fires toy-a1 and
// toy-d1) and shows it got the specs: run and run-one record both env_events and PASS (without the
// specs nothing fires and event_handled's cites name a result that never arrived); replay, regrade
// and judge-calibrate re-fire them on replay, which must agree with the recorded env_events, or
// gradeTrajectory answers GRADER_ERROR (packages/core/run.ts).
import { cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { scenarioTransport } from '../../apps/web/src/harness/scenarios.ts';
import { MODEL } from '../../packages/core/anthropic.ts';
import { parseTrajectory } from '../../packages/core/trajectory.ts';
import { GRADER_VERSION } from '../../packages/grader/grade.ts';
import { runCases, selectCases } from '../../packages/grader/matrix/matrix.ts';
import { fakeKey, tempDir } from '../../scripts/test/helpers.ts';
import { trajectoryOf } from '../adapters/result-sink-node.ts';
import { classesOf } from '../classes.ts';
import { main as contextBudget } from '../context-budget.ts';
import { main as calibrate, type Deps as CalibrateDeps } from '../judge-calibrate.ts';
import { loadMatrixTask, matrixEnv } from '../matrix.ts';
import { main as regrade } from '../regrade.ts';
import { main as replay } from '../replay.ts';
import { main as runOne } from '../run-one.ts';
import { main as run } from '../run.ts';

const SLOW = 120_000;
const SPECS = ['toy-a1', 'toy-d1'];

const envOf = (label: string) => {
  const home = tempDir(label);
  return { HOME: home, SPEND_LEDGER: join(home, 'spend.jsonl') };
};
const mockDeps = (label: string, out: string[]) => ({
  env: envOf(label),
  out: (l: string) => out.push(l),
  fetch: () => Promise.reject(new Error('no live call')),
  mock: (name: string) => scenarioTransport(name as 'toyEvent').transport,
});

// Every settled record of a run dir, with its trajectory's env_event specs.
function trials(dir: string): Array<{ file: string; record: Record<string, unknown>; fired: string[] }> {
  const root = join(dir, 'trials');
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => {
      const file = join(e.parentPath, e.name);
      const record = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      const events = parseTrajectory(readFileSync(trajectoryOf(dir, record as never), 'utf8'));
      return { file, record, fired: events.flatMap((x) => (x.type === 'env_event' ? [x.spec] : [])) };
    });
}

async function cli(main: (args: string[], deps: { out: (l: string) => void; err: (l: string) => void }) => Promise<number>, args: string[]) {
  const lines: string[] = [];
  const code = await main(args, { out: (l) => lines.push(l), err: (l) => lines.push(l) });
  return { code, text: lines.join('\n') };
}

let RUN_ONE: string;

beforeAll(async () => {
  RUN_ONE = join(tempDir('events-run-one'), 'events-run-one');
  const out: string[] = [];
  const code = await runOne(['--task', '_toy', '--model', MODEL, '--index', '0', '--mock', 'toyEvent', '--out', RUN_ONE], mockDeps('events-run-one-home', out));
  if (code !== 0) throw new Error(out.join('\n'));
}, SLOW);

const copyOf = (label: string) => {
  const copy = join(tempDir(label), label);
  cpSync(RUN_ONE, copy, { recursive: true });
  return copy;
};

describe('each caller reads the event specs from the task', () => {
  it('run-one: the trial fires both toy events, once each, and PASSes', () => {
    const [t] = trials(RUN_ONE);
    expect(t!.fired).toEqual(SPECS);
    expect(t!.record.outcome).toBe('PASS');
    expect((t!.record.state_hash as { replay_final: string; final: string }).replay_final).toBe((t!.record.state_hash as { final: string }).final);
  });

  it('run: a mocked batch trial fires both toy events and PASSes', { timeout: SLOW }, async () => {
    const dir = join(tempDir('events-run'), 'events-run');
    const out: string[] = [];
    const code = await run(['--task', '_toy', '--model', MODEL, '--out', dir, '--trials', '1', '--mock', 'toyEvent'], mockDeps('events-run-home', out));
    expect(code, out.join('\n')).toBe(0);
    const [t] = trials(dir);
    expect(t!.fired).toEqual(SPECS);
    expect(t!.record.outcome).toBe('PASS');
  });

  it('replay: the run-one trial reproduces, env_events included', { timeout: SLOW }, async () => {
    const r = await cli(replay, [copyOf('events-replay')]);
    expect(r.code, r.text).toBe(0);
    expect(r.text).toContain('1 of 1 trials reproduced');
  });

  it('regrade: the run-one trial regrades to its grade, not GRADER_ERROR', { timeout: SLOW }, async () => {
    const dir = copyOf('events-regrade');
    const r = await cli(regrade, [dir, '--grader-version', GRADER_VERSION]);
    expect(r.code, r.text).toBe(0);
    const [t] = trials(dir);
    const last = (t!.record.regrades as Array<{ outcome: string; error?: unknown }>).at(-1)!;
    expect(last.outcome, JSON.stringify(last.error ?? null)).toBe('PASS');
  });

  it('judge-calibrate: --from-trials grades the trial through replay and uses it', { timeout: SLOW }, async () => {
    const dir = copyOf('events-calibrate');
    const [t] = trials(dir);
    delete t!.record.mock;
    writeFileSync(t!.file, JSON.stringify(t!.record, null, 2));
    const lines: string[] = [];
    const deps = {
      env: { ...envOf('events-calibrate-home'), NODE_ENV: 'test', ANTHROPIC_API_KEY: fakeKey('E') },
      out: (l: string) => lines.push(l),
      fetch: () => Promise.reject(new Error('no live call')),
      writeResult: () => {},
      readResult: () => null,
    } as unknown as CalibrateDeps;
    expect(await calibrate(['--task', '_toy', '--from-trials', dir, '--dry-run'], deps), lines.join('\n')).toBe(0);
    expect(lines.join('\n')).toMatch(/judged messages in 1 trials/);
    expect(lines.join('\n')).not.toMatch(/excluded|env_event/);
  });

  it('matrix: the matrix task carries the active specs and its event case fires them', { timeout: SLOW }, async () => {
    const task = await loadMatrixTask('_toy');
    expect(task.events?.map((s) => s.id)).toEqual(SPECS);
    const [r] = await runCases(matrixEnv(), task, selectCases(task, ['event_handled']), { trials: 1, regrades: 1, isolation: false });
    expect(r!.problems).toEqual([]);
    expect(r!.grade.outcome).toBe('PASS');
    const fired = r!.grade.checks.find((c) => c.id === 'event_seen')!.items!.flatMap((i) => i.evidence.fired as string[]);
    expect(fired).toEqual(SPECS);
  });
});

// The one-line-per-arrival contract (verifier-phase-P17i-W4H0B2-197-1 F2): context-budget counts a
// trial's env_event lines and cli classes the distinct specs that fired, so each arrival must write
// exactly one line. The hook fires a spec at most once (packages/env/events.ts deliver) and the loop
// emits one line per fire; replay rejects a duplicated line (packages/core/test/events-replay).
describe('one env_event line per arrival', () => {
  it("context-budget's arrival count equals the distinct specs cli classes counts as fired", { timeout: SLOW }, async () => {
    const lines: string[] = [];
    await contextBudget([RUN_ONE, '--task', '_toy', '--observed-items', '_toy=1', '--json'], { out: (l: string) => lines.push(l), err: (l: string) => lines.push(l) } as never);
    const json = JSON.parse(lines.findLast((l) => l.startsWith('{'))!) as { tasks: Record<string, { trials: Array<{ events?: number }> }> };
    const arrivals = json.tasks._toy!.trials.map((t) => t.events ?? 0);
    const toy = await loadMatrixTask('_toy');
    const classes = await classesOf([RUN_ONE], {
      itemClasses: async () => [{ key: 'note', class: 'toy', label: 'toy' }],
      events: async () => ({ SPECS: toy.events!.map((s) => ({ id: s.id, item: s.item, class: s.class })), ACTIVE: toy.events!.map((s) => s.id) }),
    });
    const fired = classes.tasks._toy!.events.reduce((n, e) => n + e.fired, 0);
    expect(arrivals).toEqual([2]);
    expect(fired).toBe(2);
    expect(trials(RUN_ONE)[0]!.fired).toEqual([...new Set(trials(RUN_ONE)[0]!.fired)]);
  });
});
