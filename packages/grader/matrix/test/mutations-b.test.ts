// The matrix's own failure modes, part 2 (plan phase P9): what a passing case prints, and the
// checks that need no trial (traceability, double derivation, status-only, traps). Each test
// runs only the cases its assertion needs.
import { describe, expect, it } from 'vitest';
import { traceability } from '../matrix.ts';
import type { MatrixTask } from '../types.ts';
import { matrix, ONE, TOY } from './harness.ts';

describe('matrix --task _toy', () => {
  it('prints oracle 1.0 with judge.unknown 0, the cache source, and a FAIL for the null agent', async () => {
    const { code, text } = await matrix({}, { ...ONE, cases: ['oracle', 'null'] });
    expect(text).toContain('oracle: PASS score 1.000 judge.unknown 0');
    expect(text).toMatch(/^null: FAIL/m);
    expect(text).toMatch(/^judge cache: 0 misses; source scripted \d+$/m);
    expect(text).toMatch(/^double derivation: equal/m);
    expect(text).toMatch(/^traceability: (\d+)\/\1 /m);
    expect(text).toMatch(/^policy imports: clean/m);
    expect(text).toMatch(/^matrix _toy: PASS$/m);
    expect(code).toBe(0);
  });
  it('names its traps for what they test (item 8)', () => {
    expect(TOY.declares.traps).toContain('wrong_citation');
    expect(TOY.declares.traps).toContain('invalid_write_schema');
    expect(TOY.declares.traps).not.toContain('wrong_value');
    expect(TOY.declares.traps).not.toContain('rejected_write');
  });
  it('exits 1 when a check traces to no line of the prompt or a policy', async () => {
    const [first, ...rest] = TOY.checks;
    const { code, text } = await matrix({ checks: [{ ...first!, traces_to: 'instruction.md:99' }, ...rest] }, { ...ONE, cases: [] });
    expect(code).toBe(1);
    expect(text).toMatch(new RegExp(`traceability: .*${first!.id}`));
  });
  it('resolves a traces_to naming several sections of one policy, and names a missing one', () => {
    const task = (traces_to: string) => ({ instruction: 'x', policies: [{ id: 'RBC-X-01', text: '§2 Two.\n§8 Eight.' }], checks: [{ ...TOY.checks[0]!, traces_to }] }) as unknown as MatrixTask;
    expect(traceability(task('RBC-X-01 §2 and §8'))).toEqual([]);
    expect(traceability(task('RBC-X-01 §2, §8'))).toEqual([]);
    expect(traceability(task('RBC-X-01 §2 and §9'))).toEqual([{ check: TOY.checks[0]!.id, reason: 'policy RBC-X-01 has no §9' }]);
  });
  it('exits 1 when expected.ts and policy.ts disagree', async () => {
    const { code, text } = await matrix({ expected: { changed: true } }, { ...ONE, cases: [] });
    expect(code).toBe(1);
    expect(text).toMatch(/^double derivation: DIFFER/m);
  });
  it('exits 1 when the task declares a status-only case and has no status-only agent', async () => {
    const { status_only: _none, ...agents } = TOY.agents;
    const { code, text } = await matrix({ declares: { ...TOY.declares, status_only: true }, agents }, { ...ONE, cases: [] });
    expect(code).toBe(1);
    expect(text).toMatch(/^status-only: .*declared/m);
  });
});
