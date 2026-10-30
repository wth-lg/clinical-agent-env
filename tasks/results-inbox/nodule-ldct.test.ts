// RBC-RAD-05 §2 for item 1 after the P19 gate (builder-186, rulings 2026-10-30T01:12Z T2 D1 and
// D2): her nodule is followed in lung cancer screening, so the overdue screening LDCT is ordered
// within 14 days of today. A pulmonology referral does not replace that order (coordinator answer
// to builder-186, option a), so a referral alone, or with §2's 2027 CT kept, fails
// nodule_screening_ldct; the LDCT with a referral passes. When the LDCT was seen only as a
// fhir_search row (its conclusion shows the Lung-RADS category), a wrong order is reasoning, as
// the gate itself counts the report seen.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../cli/matrix.ts';
import { gradeRun, trial } from '../../packages/grader/matrix/matrix.ts';
import type { Script } from '../../packages/grader/matrix/types.ts';
import { ORACLE, solve } from './solution/solve.ts';
import { read, READ_ALL, SRC } from './solution/steps.ts';

const task = await loadMatrixTask('results-inbox');
const env = matrixEnv();
const graded = async (id: string, script: Script) => gradeRun(env, task, task.checks, await trial(env, task, { kind: 'alternative', id, script }));
const nodule = async (id: string, script: Script) => (await graded(id, script)).checks.find((c) => c.id === 'nodule_screening_ldct')!;
const CT_2027 = { code: 'IMG-CT-CHEST-WO', priority: 'routine', start: '2027-06-04', end: '2027-07-04' } as const;
const REFERRAL = { code: 'REF-PULM', priority: 'routine', start: '2026-10-26', end: '2026-11-06' } as const;
// READ_ALL without the fhir_read of the screening LDCT: the DiagnosticReport search still returns its row.
const noLdctRead = READ_ALL.map((t) => ({ ...t, calls: t.calls.filter((c) => JSON.stringify(c) !== JSON.stringify(read(SRC.ldct))) })).filter((t) => t.calls.length > 0);

describe('results-inbox nodule_screening_ldct', () => {
  it('§2 says a referral does not replace the LDCT order', () => {
    expect(readFileSync(new URL('./policy/rbc-rad-05.md', import.meta.url), 'utf8')).toMatch(/A referral does not replace the LDCT order\./);
  });

  it('fails a pulmonology referral alone', async () => {
    expect(await nodule('referral_only', solve({ nodule: { order: null, extra: [REFERRAL], due: '2026-11-06', message: true } }))).toMatchObject({ met: false });
  });

  it('fails the LDCT read, the 2027 CT kept and only a referral (verifier-phase-P19-T2-1 L1)', async () => {
    expect(await nodule('l1', solve({ nodule: { order: CT_2027, extra: [REFERRAL], due: '2027-07-04', message: true } }))).toMatchObject({ met: false });
  });

  it('passes the LDCT with a referral', async () => {
    expect(await nodule('ldct_and_referral', solve({ nodule: { ...ORACLE.nodule, extra: [REFERRAL] } }))).toMatchObject({ met: true });
  });

  it('labels a 2027 CT after the LDCT was seen only as a search row reasoning, naming the row step (D1)', async () => {
    const g = await graded('a1', solve({ reads: noLdctRead, nodule: { order: CT_2027, due: '2027-07-04', message: true } }));
    expect(g.checks.find((c) => c.id === 'nodule_screening_ldct')).toMatchObject({ met: false });
    expect(g.attribution?.auto).toBe('reasoning');
    const ldct = g.attribution?.exposure.find((e) => e.id === SRC.ldct);
    expect(ldct?.first_seen_step).toEqual(expect.any(Number));
  });
});
