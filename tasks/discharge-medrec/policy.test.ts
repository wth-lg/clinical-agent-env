// Double derivation for T4 (design section 4, "Double derivation"): policy.ts applied to the
// committed world must give expected.ts, and the decisive facts must be the design's. The
// matrix checks the same equality; this test shows it on its own.
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

describe('discharge-medrec', () => {
  it('policy.ts applied to the world equals expected.ts', () => {
    expect(derive(world)).toEqual(expected);
  });

  it('resumes lisinopril on the post-discharge creatinine and takes the addendum over the summary', () => {
    const d = derive(world) as unknown as typeof expected;
    expect(d.scr).toEqual({ id: 'Observation/obs-t4-scr-1021', mg_dl: 1.32, threshold: 1.5 });
    expect(d.lisinopril.action).toBe('resume');
    expect(d.spironolactone.daily_mg).toBe(25);
    expect(d.message_about).toEqual(['MedicationRequest/mr-t4-metoprolol-tart']);
  });

  // The overlay cannot read instruction.md or the policy file, so their prompt-date, weekday and
  // leakage checks run here, over the committed world.
  it('states no date the clock gives and no answer in the prompt or policy text', async () => {
    const task = await nodeTaskSource({ testMode: false }).get('discharge-medrec');
    const texts = [task.instruction, ...task.policies.map((p) => p.text)];
    const answers = ['25 mg daily, not 12.5', 'SCr 1.32'];
    const findings = lintWorld(all, [{ source: 'discharge-medrec', spec: { prompts: texts, leakage: { answers, texts: texts.map((text, i) => ({ source: i === 0 ? 'instruction.md' : 'RBC-TOC-02', text })) } } }]);
    expect(findings).toEqual([]);
  });
});
