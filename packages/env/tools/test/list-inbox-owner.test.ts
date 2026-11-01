// list_inbox shows and filters by owner (P17j JT1, pre-audit S10). Before the fix a results item
// reassigned to the on-call pool stayed in the signed-in user's queue with nothing to say it had
// left it (evidence/pre-audit-tasks/list-inbox-after-reassign.out.txt: 8 rows, no owner). The
// shared world holds T2's eight results items, all owned by the signed-in user.
import { readFileSync } from 'node:fs';
import type { Bundle } from '@medplum/fhirtypes';
import { beforeAll, describe, expect, it } from 'vitest';
import { clock } from '../../clock.ts';
import { parseNdjson } from '../../fixture-source.ts';
import { Store } from '../../store.ts';
import { indexDefinitions } from '../../validate.ts';
import { USER } from '../read/context.ts';
import { READ_TOOLS } from '../read/index.ts';
import { callTool, definitions, type ToolResult } from '../registry.ts';
import { USER as WRITE_USER } from '../write/context.ts';
import { newSession, TOOLS, type WriteContext } from '../write/index.ts';
import { id, IDS, ref } from '../../../../tasks/results-inbox/ids.ts';

const root = new URL('../../../../', import.meta.url);
const base = await parseNdjson(readFileSync(new URL('fixtures/world.ndjson.gz', root)));
beforeAll(() => indexDefinitions(JSON.parse(readFileSync(new URL('fixtures/definitions-pruned.json', root), 'utf8')) as Bundle));

const fresh = (): WriteContext => ({ world: new Store(base), clock, policies: [], catalog: [], session: newSession() });
const ok = (r: ToolResult): Record<string, unknown> => {
  if (r.is_error) throw new Error(`expected success, got ${JSON.stringify(r.content)}`);
  return r.content as Record<string, unknown>;
};
type Row = Record<string, unknown>;
// T2's results items only: other task overlays may add their own.
const T2_ITEMS = new Set(Object.entries(IDS).filter(([k]) => k.startsWith('task-t2-inbox-')).map(([, v]) => `Task/${v}`));
const t2 = (c: WriteContext, input: Record<string, unknown>): Row[] =>
  (ok(callTool(READ_TOOLS, 'list_inbox', { queue: 'results', count: 50, ...input }, c)).entries as Row[]).filter((r) =>
    T2_ITEMS.has(String(r.task)),
  );

describe('list_inbox owner', () => {
  it('drops an item reassigned to the on-call pool from the default list and lists it under its new owner', () => {
    const c = fresh();
    ok(callTool(TOOLS, 'update_inbox_item', { task_id: id('task-t2-inbox-4'), action: 'reassign', new_owner: 'Group/pool-oncall' }, c));
    const mine = t2(c, { status: 'requested' });
    expect(mine).toHaveLength(T2_ITEMS.size - 1);
    expect(mine.map((r) => r.task)).not.toContain(ref('Task/task-t2-inbox-4'));
    for (const r of mine) expect(r.owner).toBe('Practitioner/pr-okafor');
    const oncall = t2(c, { status: 'requested', owner: 'Group/pool-oncall' });
    expect(oncall.map((r) => [r.task, r.owner])).toEqual([[ref('Task/task-t2-inbox-4'), 'Group/pool-oncall']]);
  });

  it("lists the signed-in user's items when owner names them, and nothing for an owner with no items", () => {
    const c = fresh();
    expect(t2(c, { owner: 'Practitioner/pr-okafor' })).toEqual(t2(c, {}));
    expect(t2(c, {})).toHaveLength(T2_ITEMS.size);
    expect(T2_ITEMS.size).toBe(13); // the W1 T2 worklist: 13 results on 8 patients
    expect(t2(c, { owner: 'Practitioner/pr-lin' })).toEqual([]);
  });

  it('takes a bare id as update_inbox_item new_owner does (verifier-phase-P17i-JT1-1 F2)', () => {
    const c = fresh();
    ok(callTool(TOOLS, 'update_inbox_item', { task_id: id('task-t2-inbox-4'), action: 'reassign', new_owner: 'pool-oncall' }, c));
    expect(t2(c, { owner: 'pool-oncall' }).map((r) => [r.task, r.owner])).toEqual([[ref('Task/task-t2-inbox-4'), 'Group/pool-oncall']]);
    expect(t2(c, { owner: 'pr-okafor' })).toEqual(t2(c, {}));
  });

  it('rejects an owner that is not a Practitioner or Group, and names an owner that does not exist (F3)', () => {
    const r = callTool(READ_TOOLS, 'list_inbox', { queue: 'results', owner: 'Patient/pt-0008' }, fresh());
    expect(r.is_error).toBe(true);
    expect(r.content).toMatchObject({ error: { code: 'INVALID_INPUT', field: 'owner', message: expect.stringMatching(/Practitioner or Group/) } });
    for (const owner of ['Group/pool-on-call', 'pool-on-call']) {
      const missing = callTool(READ_TOOLS, 'list_inbox', { queue: 'results', owner }, fresh());
      expect(missing.is_error, owner).toBe(true);
      expect(missing.content).toMatchObject({ error: { code: 'NOT_FOUND', field: 'owner' } });
    }
  });

  it('defaults to the one signed-in user every tool uses (F4)', () => {
    expect(USER).toBe('Practitioner/pr-okafor');
    expect(WRITE_USER).toBe(USER);
  });

  it('says in its description that rows carry the owner and the default is the signed-in user', () => {
    const d = definitions(READ_TOOLS).find((t) => t.name === 'list_inbox')!;
    expect(d.description).toMatch(/\bowner\b/);
    expect(d.description).toMatch(/signed-in user/);
    expect(Object.keys(d.inputSchema.properties)).toContain('owner');
  });
});
