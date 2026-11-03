// context-budget --project --lever <task=set,...> (plan-amendment-w5 W5-H): a task's cost projected
// at a lever set. Each A item of the set adds one event (r requests, as --events counts them) and
// each B item one list item (k requests), on top of --items and --events, so pilot sizing and S5-6
// read one number per set. The set names the task's lever items (tasks/<id>/expected.ts
// LEVER_ITEMS) by id, joined with '+'.
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../scripts/test/helpers.ts';
import type { TaskLever } from '../classes.ts';
import { type Deps, main, type Projection } from '../context-budget.ts';
import { type QuadTrial, writeQuadRun } from './fixtures/context-budget/make-run.ts';

const CRC: QuadTrial[] = [26, 28, 30].map((T) => ({ T, C0: 10_000, g: 5_000, o: 500 }));
const INBOX: QuadTrial[] = [10, 12, 14, 16].map((T) => ({ T, C0: 8_000, g: 2_000, o: 400 }));
const ITEMS: Record<string, number> = { 'crc-care-gap': 14, 'results-inbox': 8 };
const LEVER: Record<string, TaskLever> = {
  'crc-care-gap': { active: ['A', 'B'], items: [{ id: 'A', kind: 'A', item: 'x', spec: 'e', sibling: [] }, { id: 'B', kind: 'B', item: 'y', sibling: [] }, { id: 'R', kind: 'B', item: 'z', sibling: [] }] },
};
const deps: Partial<Deps> = { checkoutEnv: async (id) => `ev-${id}`, taskItems: async (id) => ITEMS[id] ?? null, lever: async (id) => LEVER[id] ?? null };

function fixture(name: string): string {
  const dir = tempDir(`context-budget-lever-${name}`);
  writeQuadRun(dir, { 'crc-care-gap': CRC, 'results-inbox': INBOX });
  return dir;
}

interface Out { tasks: Record<string, { projection?: Projection }>; breaks: string[] }

async function run(args: string[], d: Partial<Deps> = deps): Promise<{ code: number; json: Out | null; lines: string[] }> {
  const lines: string[] = [];
  const code = await main(args, { out: (l) => lines.push(l), err: (l) => lines.push(l), ...d });
  const raw = args.includes('--json') ? lines.find((l) => l.startsWith('{')) : undefined;
  return { code, json: raw ? (JSON.parse(raw) as Out) : null, lines };
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

describe('context-budget --lever', () => {
  it('adds one event per A item and one list item per B item of the set to the projection', async () => {
    const { code, json, lines } = await run([fixture('set'), '--project', '--items', 'crc-care-gap=10,results-inbox=6', '--events', 'crc-care-gap=4', '--req-per-event', '3', '--lever', 'crc-care-gap=A+B', '--json']);
    expect(code).toBe(0);
    const crc = json!.tasks['crc-care-gap']!.projection!;
    // k = (T - 2) / 14 per trial; at 10 + 1 items and 4 + 1 events of 3 requests.
    expect(crc.T).toBeCloseTo(median(CRC.map((t) => 2 + ((t.T - 2) / 14) * 11 + 3 * 5)), 9);
    expect(crc).toMatchObject({ items: 11, events: 5, req_per_event: 3, lever: { set: ['A', 'B'], a: 1, b: 1 } });
    expect(json!.tasks['results-inbox']!.projection!.lever).toBeUndefined();
    expect(lines.some((l) => /crc-care-gap at 11 items and 5 events \(r 3\) with lever \{A,B\} \(1 A, 1 B\)/.test(l))).toBe(true);
  });

  it('a set of one B item adds no event, so it needs no r; a set with an A item needs one', async () => {
    const b = await run([fixture('b-only'), '--project', '--items', '10', '--lever', 'crc-care-gap=B', '--json']);
    expect(b.code).toBe(0);
    expect(b.json!.tasks['crc-care-gap']!.projection).toMatchObject({ items: 11, lever: { set: ['B'], a: 0, b: 1 } });
    expect(b.json!.tasks['crc-care-gap']!.projection!.events).toBeUndefined();
    const a = await run([fixture('a-no-r'), '--project', '--items', '10', '--lever', 'crc-care-gap=A']);
    expect(a.code).toBe(2);
    expect(a.lines.join('\n')).toMatch(/--lever crc-care-gap=A adds an event, which needs --req-per-event <r>/);
  });

  it('refuses --lever without --project, a malformed set, an unknown item, an inactive item, and a task without lever items', async () => {
    const dir = fixture('usage');
    expect((await run([dir, '--lever', 'crc-care-gap=A'])).code).toBe(2);
    expect((await run([dir, '--project', '--items', '10', '--lever', 'crc-care-gap'])).code).toBe(2);
    const unknown = await run([dir, '--project', '--items', '10', '--lever', 'crc-care-gap=A+Z', '--req-per-event', '3']);
    expect(unknown.code).toBe(2);
    expect(unknown.lines.join('\n')).toMatch(/--lever crc-care-gap names Z, which is not a lever item of the task \(A, B, R\)/);
    const inactive = await run([dir, '--project', '--items', '10', '--lever', 'crc-care-gap=B+R']);
    expect(inactive.code).toBe(0);
    expect(inactive.lines.join('\n')).toMatch(/crc-care-gap: lever item R is inactive in the checkout \(LEVER\); projected as if active/);
    const none = await run([dir, '--project', '--items', '10', '--lever', 'results-inbox=A', '--req-per-event', '3']);
    expect(none.code).toBe(2);
    expect(none.lines.join('\n')).toMatch(/--lever results-inbox: tasks\/results-inbox\/expected\.ts declares no LEVER_ITEMS/);
    const twice = await run([dir, '--project', '--items', '10', '--lever', 'crc-care-gap=A+A', '--req-per-event', '3']);
    expect(twice.code).toBe(2);
  });
});
