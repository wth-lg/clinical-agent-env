// Double derivation for T6 (design section 4, "Double derivation"): policy.ts applied to the
// committed world must give expected.ts, item by item, and each item's decisive facts must be
// the ones the design names. The matrix checks the same equality; this test shows it on its own.
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { matrixEnv } from '../../cli/matrix.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { lintWorld } from '../../packages/env/lint/index.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { expected } from './expected.ts';
import { derive } from './policy.ts';

const store = await loadStore(matrixEnv().world);
const all = [...store.resources()];
const world: WorldView = { get: (type, id) => store.get(type, id), all: (type) => (type === undefined ? all : all.filter((r) => r.resourceType === type)) };
const d = derive(world) as typeof expected;

describe('message-queue', () => {
  it('policy.ts applied to the world equals expected.ts', () => {
    expect(d).toEqual(expected);
  });

  it('decides each item the way the design does', () => {
    expect(d.items).toHaveLength(6);
    // M1: the BMP is 45 days past 12 months and the visit is within 15: a 30-day bridge.
    expect(d.m1).toMatchObject({ action: 'bridge', bmp_date: '2025-09-08', last_visit: '2026-03-17', supply_days: 30, refills: 0 });
    // M2: a note after the order says the drug was stopped: no refill, a Task to the PCP.
    expect(d.m2).toMatchObject({ action: 'task_pcp', conflict_note: 'DocumentReference/doc-t6-odum-0811' });
    expect(d.m3.action).toBe('triage');
    // M4: 12 notes in the 3-year window; the reaction is in the scanned urgent-care note only.
    expect(d.m4).toMatchObject({ action: 'hold', notes_in_window: 12, reaction_note: 'DocumentReference/doc-t6-park-240309' });
    expect(d.m5).toMatchObject({ action: 'renew', supply_days: 90, refills: 1 });
    expect(d.m6.action).toBe('route');
  });

  // The overlay cannot read instruction.md or the policy files, so their prompt-date, weekday and
  // leakage checks run here, over the committed world.
  it('states no date the clock gives and no answer in the prompt or policy text', async () => {
    const task = await nodeTaskSource({ testMode: false }).get('message-queue');
    const texts = [task.instruction, ...task.policies.map((p) => p.text)];
    const answers = ['doc-t6-park-240309', 'Augmentin', '2024-03-09', 'mr-t6-atorvastatin'];
    const findings = lintWorld(all, [{ source: 'message-queue', spec: { prompts: texts, leakage: { answers, texts: texts.map((text, i) => ({ source: i === 0 ? 'instruction.md' : task.policies[i - 1]!.id, text })) } } }]);
    expect(findings).toEqual([]);
  });
});
