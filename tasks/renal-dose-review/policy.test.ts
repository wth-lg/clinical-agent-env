// Double derivation for T1 (design section 4, "Double derivation"): policy.ts applied to the
// committed world must give expected.ts, and the decisive numbers must be the ones the design
// computes by hand. The matrix checks the same equality; this test shows it on its own.
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
const decode = (data: string | undefined) => new TextDecoder().decode(Uint8Array.from(atob(data ?? ''), (c) => c.charCodeAt(0)));
const world: WorldView = { get: (type, id) => store.get(type, id), all: (type) => (type === undefined ? all : all.filter((r) => r.resourceType === type)) };

describe('renal-dose-review', () => {
  it('policy.ts applied to the world equals expected.ts', () => {
    expect(derive(world)).toEqual(expected);
  });

  it('computes eGFR (CKD-EPI 2021) and CrCl (Cockcroft-Gault, actual weight) from the latest valid inputs', () => {
    // SCr 1.21 mg/dL (obs-t1-scr-1020), male, 82 years: 142 x (1.21 / 0.9)^-1.200 x 0.9938^82.
    const egfr = 142 * (1.21 / 0.9) ** -1.2 * 0.9938 ** 82;
    // 143 lb = 64.86 kg (obs-t1-wt-1020): (140 - 82) x 64.86 / (72 x 1.21).
    const crcl = ((140 - 82) * 143 * 0.45359237) / (72 * 1.21);
    expect(egfr).toBeCloseTo(59.78, 2);
    expect(crcl).toBeCloseTo(43.18, 2);
    const d = derive(world) as typeof expected;
    expect(d.egfr).toBe(Math.round(egfr * 10) / 10);
    expect(d.crcl).toBe(Math.round(crcl * 10) / 10);
  });

  it('takes neither the entered-in-error SCr nor the stale weight', () => {
    const d = derive(world) as typeof expected;
    expect(d.scr.id).toBe('Observation/obs-t1-scr-1020');
    expect(d.weight.id).toBe('Observation/obs-t1-wt-1020');
  });

  // The overlay cannot read instruction.md or the policy file, so their prompt-date, weekday and
  // leakage checks run here, over the committed world.
  it('states no date the clock gives and no answer in the prompt or policy text', async () => {
    const task = await nodeTaskSource({ testMode: false }).get('renal-dose-review');
    const texts = [task.instruction, ...task.policies.map((p) => p.text)];
    const answers = [String(expected.egfr), String(expected.crcl), '43.18', '59.78'];
    const findings = lintWorld(all, [{ source: 'renal-dose-review', spec: { prompts: texts, leakage: { answers, texts: texts.map((text, i) => ({ source: i === 0 ? 'instruction.md' : 'RBC-PHARM-07', text })) } } }]);
    expect(findings).toEqual([]);
  });

  // R14-05 (P18o): a newer patient-stated weight under 60 kg, coded 3142-7 (Body weight Stated),
  // not the measured 29463-7, and the pharmacist's chart note written from the SCr of 1.88 before
  // it was marked entered in error. RBC-PHARM-07 §1 takes neither.
  it('takes the measured weight and the valid SCr over the stated weight and the pharmacist note', () => {
    const stated = all.flatMap((r) => (r.resourceType === 'Observation' && r.subject?.reference === 'Patient/pt-0002' && (r.code?.coding ?? []).some((c) => c.code === '3142-7') ? [r] : []));
    expect(stated.map((r) => r.id)).toEqual(['obs-t1-wt-1022']);
    expect(stated[0]!.valueQuantity).toMatchObject({ value: 132, code: '[lb_av]' });
    expect(Date.parse(stated[0]!.effectiveDateTime!)).toBeGreaterThan(Date.parse('2026-10-20T09:05:00-04:00'));
    const flag = store.get('DocumentReference', 'doc-t1-rx-1021') as Extract<(typeof all)[number], { resourceType: 'DocumentReference' }> | undefined;
    const text = decode(flag?.content[0]?.attachment.data);
    expect(text).toContain('1.88 mg/dL');
    expect(flag?.date).toBe('2026-10-21T14:10:00-04:00');
    const d = derive(world) as typeof expected;
    expect(d.weight.id).toBe('Observation/obs-t1-wt-1020');
    expect(d.scr.id).toBe('Observation/obs-t1-scr-1020');
  });

  // P19 lever (researcher-16 T1): his apixaban is the extended-phase dose after a pulmonary
  // embolism, which RBC-PHARM-07 §2 (non-valvular atrial fibrillation only) does not cover, so the
  // dose stays 2.5 mg twice daily whatever §2's criteria give. No record of his may name atrial
  // fibrillation, or the indication would be in dispute.
  it('finds no atrial fibrillation on his chart, so §2 does not set the apixaban dose', () => {
    const text = (r: (typeof all)[number]) => JSON.stringify(r) + (r.resourceType === 'DocumentReference' ? decode(r.content[0]?.attachment.data) : '');
    const af = all.filter((r) => JSON.stringify(r).includes('"Patient/pt-0002"') && /atrial fib|49436004|\bNVAF\b/i.test(text(r))).map((r) => `${r.resourceType}/${r.id}`);
    expect(af).toEqual([]);
    const order = store.get('MedicationRequest', 'mr-t1-apixaban') as Extract<(typeof all)[number], { resourceType: 'MedicationRequest' }> | undefined;
    expect(order?.reasonCode?.[0]?.text).toBe('History of pulmonary embolism');
    const d = derive(world) as typeof expected;
    expect(d.apixaban).toEqual({ request: 'MedicationRequest/mr-t1-apixaban', action: 'unchanged', nvaf: false, dose_mg: 2.5, per_day: 2 });
  });

  it('applies §2 when the order is for non-valvular atrial fibrillation', () => {
    const asAf = (r: (typeof all)[number]) =>
      r.resourceType === 'MedicationRequest' && r.id === 'mr-t1-apixaban' ? { ...r, reasonCode: [{ text: 'Non-valvular atrial fibrillation' }] } : r;
    const af = all.map(asAf);
    const d = derive({ get: (type, id) => af.find((r) => r.resourceType === type && r.id === id), all: (type) => (type === undefined ? af : af.filter((r) => r.resourceType === type)) }) as unknown as { apixaban: unknown };
    expect(d.apixaban).toEqual({ request: 'MedicationRequest/mr-t1-apixaban', action: 'increase', nvaf: true, criteria: { age: true, weight: false, scr: false }, dose_mg: 5, per_day: 2 });
  });
});
