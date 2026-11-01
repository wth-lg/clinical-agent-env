// pnpm cli events-solve (plan-amendment-w4 PW4-H0b, stop rule S-2): picks each task's event count
// e* from a classes JSON and the context-budget projection. The PW4-H0b gate is the first block: a
// synthetic classes JSON with pooled f = 0.12 over the sizing table's lists (n, e_max, pilot-4a's 4
// events, r = 3, T5's base rate 11/12), costed from results/probe-1 by the per-trial projection,
// returns the corrected e* column (coordinator ruling for builder-275: T2 7 where the plan's first
// draft, costed by median parameters, had 6); at f = 0.15 it returns the draft's column.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../scripts/test/helpers.ts';
import type { ClassesJson, EventRow, TaskClasses } from '../classes.ts';
import { type Deps, main, pooled, type SolveJson } from '../events-solve.ts';

const N = { 'renal-dose-review': 5, 'results-inbox': 7, 'crc-care-gap': 4, 'discharge-medrec': 8, 'contrast-ct-prep': 4, 'message-queue': 6 };
const EMAX = { 'renal-dose-review': 6, 'results-inbox': 8, 'crc-care-gap': 4, 'discharge-medrec': 9, 'contrast-ct-prep': 5, 'message-queue': 6 };
const TASKS = Object.keys(N);
const spec = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k}=${v}`).join(',');

const ev = (id: string, cls: EventRow['class'], obs: number, seen: number, fails: number): EventRow => ({
  id, item: `item-${id}`, class: cls, active: true, fired: obs, fails, observations: obs, wilson: null, labels: [], seen, amend_fails_seen: cls === 'D' ? 0 : fails,
});

// Six tasks of 16 trials: 4 amend events, each observed and seen 4 times (16 seen per task, 96
// pooled), one lure observed 16 times, and amendFails spread over the 24 amend events.
function synthetic(amendFails: number, lureFails = 0): ClassesJson {
  const tasks: Record<string, TaskClasses> = {};
  TASKS.forEach((id, t) => {
    const fails = [0, 1, 2, 3].map((k) => Math.floor((amendFails + ((t * 4 + k) % 24)) / 24));
    tasks[id] = {
      trials_valid: 16, pass: 8, wilson: null, split: { model: 8, environment: 0, grader: 0, infra: 0 }, guard_fires: 0,
      q: { trials: 16, seen_all: 16, rate: 1 },
      classes: [{ class: 'base', fails: 0, base_fails: id === 'contrast-ct-prep' ? 1 : 0, observations: 12, pass_rate: 1, wilson: null, labels: [], instances: [] }],
      events: [...fails.map((f, k) => ev(`${id}-a${k}`, 'A', 4, 4, f)), ev(`${id}-d`, 'D', 16, 16, t === 0 ? lureFails : 0)],
      outside_failures: [], independence: { all_items_pass: 0, expected_per_item: 0, expected_per_class: 0 }, outcomes: [],
    };
  });
  return { schema_version: 1, run_dirs: ['synthetic'], grader_versions: ['18'], tasks };
}

function file(json: ClassesJson, name: string): string {
  const f = join(tempDir(`events-solve-${name}`), 'classes.json');
  writeFileSync(f, JSON.stringify(json));
  return f;
}

async function run(args: string[], deps: Partial<Deps> = {}): Promise<{ code: number; json: SolveJson | null; lines: string[] }> {
  const lines: string[] = [];
  const code = await main(args, { out: (l) => lines.push(l), err: (l) => lines.push(l), ...deps });
  const raw = args.includes('--json') ? lines.find((l) => l.startsWith('{')) : undefined;
  return { code, json: raw ? (JSON.parse(raw) as SolveJson) : null, lines };
}

const sized = (f: string, extra: string[] = []) => ['--classes', f, '--cost-from', 'results/probe-1', '--items', spec(N), '--emax', spec(EMAX), '--current', spec(Object.fromEntries(TASKS.map((t) => [t, 4]))), '--req-per-event', '3', ...extra, '--json'];
const eStar = (j: SolveJson) => Object.fromEntries(Object.entries(j.tasks).map(([id, t]) => [id, t.e_star]));

describe('PW4-H0b gate: events-solve on a synthetic classes JSON', () => {
  it('pooled f = 0.12 returns the corrected e* column under both cost lines', async () => {
    const synth = synthetic(11);
    expect(pooled(synth).f).toBeCloseTo(0.12, 2);
    const { code, json } = await run(sized(file(synth, 'f12')));
    expect(code).toBe(0);
    expect(eStar(json!)).toEqual({ 'contrast-ct-prep': 5, 'crc-care-gap': 4, 'discharge-medrec': 6, 'message-queue': 6, 'renal-dose-review': 6, 'results-inbox': 7 });
    expect(json!.mean_p90_usd).toBeLessThanOrEqual(2.4);
    expect(json!.mean_p90_usd).toBeCloseTo(2.38, 2);
    for (const t of Object.values(json!.tasks)) expect(t.p90_usd).toBeLessThanOrEqual(3);
    expect(json!.s1_lever_dead).toBe(false);
    expect(json!.tasks['crc-care-gap']!.action).toBe('v1_plus_4');
    expect(json!.tasks['results-inbox']!.action).toBe('v2_8');
  }, 120_000);

  it('pooled f = 0.15 returns the draft plan\'s column (T2 6)', async () => {
    const synth = synthetic(14);
    expect(pooled(synth).f).toBeCloseTo(0.15, 2);
    const { json } = await run(sized(file(synth, 'f15')));
    expect(eStar(json!)).toEqual({ 'contrast-ct-prep': 5, 'crc-care-gap': 4, 'discharge-medrec': 6, 'message-queue': 6, 'renal-dose-review': 6, 'results-inbox': 6 });
  }, 120_000);
});

describe('pooled estimates (stop rule S, +0.5 smoothing)', () => {
  it('f = (amend fails among seen + 0.5) / (seen + 1), q and p_D the same way', () => {
    const p = pooled(synthetic(11, 2));
    expect(p.f).toBeCloseTo(11.5 / 97, 12);
    expect(p.q).toBeCloseTo(96.5 / 97, 12);
    expect(p.p_d).toBeCloseTo(1 - 2.5 / 97, 12);
    expect(p.event_fails).toBe(13);
    expect(p.b['contrast-ct-prep']).toBeCloseTo(11 / 12, 12);
    expect(p.b['crc-care-gap']).toBe(1);
  });
});

describe('S-1 and S-2 actions', () => {
  it('S-1: zero event failures in every observation freezes every task on v1', async () => {
    const { code, json, lines } = await run(sized(file(synthetic(0), 's1')));
    expect(code).toBe(0);
    expect(json!.s1_lever_dead).toBe(true);
    expect(Object.values(json!.tasks).every((t) => t.action === 'freeze_v1')).toBe(true);
    expect(lines.some((l) => /S-1/.test(l))).toBe(true);
  }, 120_000);

  it('a task whose pred at e_max is above 0.70 freezes on v1 at its current count', async () => {
    const { json } = await run(sized(file(synthetic(2), 'freeze')));
    const crc = json!.tasks['crc-care-gap']!;
    expect(crc.pred_at_emax).toBeGreaterThan(0.7);
    expect([crc.action, crc.e_star]).toEqual(['freeze_v1', 4]);
  }, 120_000);

  it('exits 1 when no event counts meet the cost lines', async () => {
    const { code, lines } = await run(['--classes', file(synthetic(11), 'over'), '--cost-from', 'results/probe-1', '--items', spec({ ...N, 'crc-care-gap': 40 }), '--emax', spec(EMAX), '--current', spec(Object.fromEntries(TASKS.map((t) => [t, 4])))]);
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/no event counts/);
  }, 120_000);

  it('refuses --classes without --cost-from, both a run and --classes, and a classes file of another schema', async () => {
    const f = file(synthetic(11), 'usage');
    expect((await run(['--classes', f])).code).toBe(2);
    expect((await run(['results/probe-1', '--classes', f, '--cost-from', 'results/probe-1'])).code).toBe(2);
    const bad = file({ ...synthetic(11), schema_version: 2 as 1 }, 'schema');
    expect((await run(['--classes', bad, '--cost-from', 'results/probe-1'])).code).toBe(1);
  });

  it('exits 1 when no event was observed', async () => {
    const none = synthetic(0);
    for (const t of Object.values(none.tasks)) t.events = [];
    const { code, lines } = await run(sized(file(none, 'none')));
    expect(code).toBe(1);
    expect(lines.join('\n')).toMatch(/no event observations/);
  });
});
