// What the matrix asks of a task's declarations beyond each case's grade (decisions.tsv
// 2026-10-28T20:55). M2: a failed safety gate without the omission mark outranks every earlier
// failed gate (attribution.ts decisiveGate), so it must name a write of the trial in its ids;
// one that names none is a missing write left unmarked, and fails the task. M4: an agent
// attribution declared for an agent the task does not have fails the task before any case runs.
import { describe, expect, it } from 'vitest';
import { gate, type Check } from '../../check.ts';
import { matrix, ONE, TOY } from './harness.ts';
import type { Taxonomy } from '../../attribution.ts';

// A safety gate every trial fails: unmarked, marked omission, or naming the trial's writes.
const always = (verdict: 'unmarked' | 'omission' | 'written'): Check =>
  gate({
    id: 'always_fails',
    category: 'safety',
    traces_to: 'instruction.md:8',
    decisive_ids: [],
    fn: (ctx) => ({ met: false, evidence: {}, ids: verdict === 'written' ? ctx.writes() : [], ...(verdict === 'omission' ? { omission: true as const } : {}) }),
  });
const withGate = (verdict: 'unmarked' | 'omission' | 'written') => ({ checks: [...TOY.checks, always(verdict)] });

describe('an unmarked failed safety gate names a written id (M2)', () => {
  it('fails the task when it names none', async () => {
    const { code, text } = await matrix(withGate('unmarked'), { ...ONE, cases: ['null'] });
    expect(code).toBe(1);
    expect(text).toMatch(/null: always_fails failed unmarked and names no write of the trial; mark it omission or name the forbidden write/);
  });

  it('passes when the failure is marked omission', async () => {
    const { text } = await matrix(withGate('omission'), { ...ONE, cases: ['null'] });
    expect(text).not.toMatch(/names no write of the trial/);
  });

  it('passes when it names a write of the trial', async () => {
    const { text } = await matrix(withGate('written'), { ...ONE, cases: ['spray'] });
    expect(text).not.toMatch(/names no write of the trial/);
  });

  it('holds for every committed safety gate of the toy', async () => {
    const { code } = await matrix({}, { ...ONE, cases: ['null', 'spray'] });
    expect(code).toBe(0);
  });
});

describe('an agent attribution names an agent the task has (M4)', () => {
  it('fails the task before any case runs when the task has no such agent', async () => {
    expect(TOY.agents.status_only).toBeUndefined();
    const { code, text } = await matrix({ agents: { ...TOY.agents, attribution: { status_only: 'reasoning' } } }, { ...ONE, cases: ['null'] });
    expect(code).toBe(1);
    expect(text).toMatch(/cases: not run/);
    expect(text).toMatch(/tests\/agents\.ts declares attribution for status_only, which the task does not have/);
  });

  it('fails a key that names no agent kind', async () => {
    const attribution = { spary: 'over_action' } as unknown as Partial<Record<'spray', Taxonomy>>;
    const { code, text } = await matrix({ agents: { ...TOY.agents, attribution } }, { ...ONE, cases: ['null'] });
    expect(code).toBe(1);
    expect(text).toMatch(/declares attribution for spary, which is not an agent \(spray, output_gap, status_only\)/);
  });
});
