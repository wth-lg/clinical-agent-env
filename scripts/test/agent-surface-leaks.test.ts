// Design leaks on the agent-visible surface (researcher-17 section 1.2, builder-189): what the
// agent can read must carry the clinic's records and policies only, never a trace of how the
// tasks were built. Measured on the committed world (fixtures/world.ndjson.gz, attachments
// decoded), every real task's instruction and policy texts, read_policy's output, the system
// prompt and the tool definitions. Each rule counts 0:
//   - a resource id, reference or text naming a task-tagged id (obs-t1-..., task-t2-...): planted
//     resources take neutral ids from their task's registry (tasks/<id>/ids.ts);
//   - a clinical resource id that is not <prefix>-<digits>, the shape of the Synthea cohort's ids,
//     so no id carries a descriptive word; Practitioner, Organization and Group ids are
//     name-shaped, as the setting's are (pr-okafor, org-st-brigid);
//   - a resource with meta (the 'Hand-written synthetic note' tag lived there; the base cohort
//     carries none);
//   - a designer word (trap, lever, mutant, oracle, decisive, planted, synthetic, grader, rubric,
//     exploit, fixture, overlay, a plan id such as P19 or a review id such as R14-06);
//   - a policy's source text, or a source field, in read_policy's output;
//   - T3 E15's stray hemiplegia (his stroke stays; nursing home residence is his exclusion).
// 'expected' is not in the list: FHIR's expectedSupplyDuration and plain English use it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import type { Task } from '../../packages/core/tasks.ts';
import { SYSTEM_PROMPT } from '../../packages/core/run.ts';
import { readPolicy } from '../../packages/env/tools/read/policy.ts';
import type { ReadContext } from '../../packages/env/tools/read/context.ts';
import { definitions } from '../../packages/env/tools/registry.ts';
import { TOOLS } from '../../packages/env/tools/write/index.ts';
import { gunzip } from '../fixtures-lib.ts';
import { repoRoot } from './helpers.ts';

type R = Record<string, unknown> & { resourceType: string; id: string };
const world = gunzip(readFileSync(join(repoRoot, 'fixtures/world.ndjson.gz')))
  .toString('utf8')
  .split('\n')
  .filter((l) => l !== '')
  .map((l) => JSON.parse(l) as R);

const TASK_TAG = /(?:^|[^A-Za-z0-9])[a-z]+-t[1-6]-[a-z0-9]/;
const DESIGNER = /\b(traps?|levers?|mutants?|oracle|decisive|planted|synthetic|grader|rubric|exploit|fixtures?|overlays?|P1\d[a-z]?|R14-\d+)\b/i;
const NAME_SHAPED = new Set(['Practitioner', 'Organization', 'Group']);
const NEUTRAL = /^[a-z]+-\d{4,5}$/;
const NAMED = /^(pr|org|grp|pool)-[a-z]+(-[a-z]+)*$/;

// Every string value in v (keys are FHIR element names), attachment data decoded.
const strings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v !== null && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) strings(k === 'data' && typeof x === 'string' ? Buffer.from(x, 'base64').toString('utf8') : x, out);
  }
  return out;
};
const hits = (pattern: RegExp, items: ReadonlyArray<[string, unknown]>) =>
  items.flatMap(([where, v]) => strings(v).flatMap((s) => (pattern.test(s) ? [`${where}: ${s.match(pattern)![0]} in '${s.slice(0, 80)}'`] : [])));

describe('the world carries no design leak', () => {
  const each = world.map((r): [string, unknown] => [`${r.resourceType}/${r.id}`, r]);
  it('no id, reference or text names a task-tagged id', () => {
    expect(hits(TASK_TAG, each)).toEqual([]);
  });
  it('every id is Synthea-shaped, or name-shaped for a Practitioner, Organization or Group', () => {
    expect(world.filter((r) => !(NAME_SHAPED.has(r.resourceType) ? NAMED : NEUTRAL).test(r.id)).map((r) => `${r.resourceType}/${r.id}`)).toEqual([]);
  });
  it('no resource carries meta', () => {
    expect(world.filter((r) => r.meta !== undefined).map((r) => `${r.resourceType}/${r.id}`)).toEqual([]);
  });
  it('no string carries a designer word', () => {
    expect(hits(DESIGNER, each)).toEqual([]);
  });
  it("T3 E15 (pt-0034) has no hemiplegia", () => {
    const e15 = world.filter((r) => r.resourceType === 'Condition' && (r.subject as { reference?: string } | undefined)?.reference === 'Patient/pt-0034');
    expect(e15.filter((r) => /hemipleg/i.test(JSON.stringify(r.code))).map((r) => r.id)).toEqual([]);
  });
});

describe('what the agent reads besides the world carries no design leak', () => {
  let tasks: Task[] = [];
  beforeAll(async () => {
    tasks = await nodeTaskSource({ testMode: false }).all();
  });

  it('read_policy returns no source, on a single read or in the list', () => {
    expect(tasks.length).toBe(6);
    const leaks: string[] = [];
    for (const t of tasks) {
      const ctx = { policies: t.policies } as unknown as ReadContext;
      const outputs = [readPolicy.run({}, ctx), ...t.policies.map((p) => readPolicy.run({ policy_id: p.id }, ctx))];
      for (const out of outputs) {
        const json = JSON.stringify(out);
        if (json.includes('"source"')) leaks.push(`${t.id}: a source field`);
        for (const p of t.policies) if (json.includes(JSON.stringify(p.source).slice(1, -1))) leaks.push(`${t.id}: ${p.id}'s source text`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it('instructions, policy texts, the system prompt and the tool definitions name no tagged id or designer word', () => {
    const items: Array<[string, unknown]> = [
      ['system prompt', SYSTEM_PROMPT],
      ['tool definitions', definitions(TOOLS)],
      ...tasks.flatMap((t): Array<[string, unknown]> => [
        [`${t.id} instruction`, t.instruction],
        ...t.policies.map((p): [string, unknown] => [`${t.id} ${p.id}`, [p.id, p.title, p.version, p.effective, p.text]]),
        [`${t.id} catalog`, t.catalog],
      ]),
    ];
    expect([...hits(TASK_TAG, items), ...hits(DESIGNER, items)]).toEqual([]);
  });
});
