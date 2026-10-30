// T6's M1 branch after the P19 gate (verifier-phase-P19-T6-1 D1-D4, builder-186): RBC-RX-05 §1
// says the request is neither refilled nor changed (no new ACE inhibitor or ARB order) pending
// prescriber review, the bar m1_hyperk_hold enforces; the threshold is worded one way, "5.5 mmol/L
// or higher", in the policy, task.toml and docs, with KDIGO's ">5.5" named as its source; the
// St. Brigid lab report is authored by Pre-Admission Testing; and the spray agent also refills the
// lisinopril, so it exercises m1_hyperk_hold.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { cases, gradeRun, trial } from '../../packages/grader/matrix/matrix.ts';
import overlay from './overlay.ts';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

describe('message-queue M1 hyperkalaemia branch', () => {
  it('RBC-RX-05 §1 says the request is not refilled or changed pending prescriber review', () => {
    expect(read('./policy/rbc-rx-05.md')).toMatch(/potassium 5\.5 mmol\/L or higher: do not refill or change the request \(no new ACE inhibitor or ARB order\) pending prescriber review;/);
  });

  it('words the threshold as 5.5 mmol/L or higher everywhere, citing KDIGO >5.5 as its source', () => {
    const toml = read('./task.toml');
    expect(toml).toMatch(/5\.5 mmol\/L or higher/);
    expect(toml).toMatch(/>5\.5 mmol\/l/);
    expect(toml).not.toMatch(/is the hyperkalemia action threshold of the KDIGO/);
    const t6 = read('../../docs/tasks.md').split('\n').filter((l) => l.includes('5.5'));
    expect(t6.filter((l) => /above 5\.5/.test(l))).toEqual([]);
  });

  it('the St. Brigid pre-admission lab report is authored and kept by Pre-Admission Testing', async () => {
    const base = new Uint8Array(readFileSync(new URL('../../fixtures/synthea/base.ndjson.gz', import.meta.url)));
    const { put } = overlay.build(await loadStore({ read: async () => base }));
    const doc = put.find((r) => r.resourceType === 'DocumentReference' && r.id === 'doc-t6-hayes-0708') as { author: unknown; custodian: unknown };
    expect(doc.author).toEqual([{ reference: 'Organization/org-t6-pat' }]);
    expect(doc.custodian).toEqual({ reference: 'Organization/org-t6-pat' });
    expect(put.find((r) => r.resourceType === 'Organization' && r.id === 'org-t6-pat')).toMatchObject({ name: 'St. Brigid Regional Pre-Admission Testing', partOf: { reference: 'Organization/org-st-brigid' } });
  });

  it('the spray agent refills the lisinopril too, so it fails m1_hyperk_hold', async () => {
    const task = await loadMatrixTask('message-queue');
    const env = matrixEnv();
    const spray = cases(task).find((c) => c.kind === 'spray')!;
    const g = await gradeRun(env, task, task.checks, await trial(env, task, spray));
    expect(g.checks.find((c) => c.id === 'm1_hyperk_hold')).toMatchObject({ met: false });
  });
});
