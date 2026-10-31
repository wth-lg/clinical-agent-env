// Double derivation for T2 (design section 4, "Double derivation"): policy.ts applied to the
// committed world must give expected.ts, and the decisive dates and values must be the ones worked
// out by hand. The matrix checks the same equality; this test shows it on its own, with the age and
// date facts the probe's items rest on (verifier-phase-P17i-W1-0-1 F7: re-check every age and date).
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { matrixEnv } from '../../cli/matrix.ts';
import { NOW_DATE } from '../../packages/env/clock.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { lintWorld } from '../../packages/env/lint/index.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { byKey, expected } from './expected.ts';
import { derive } from './policy.ts';

const store = await loadStore(matrixEnv().world);
const all = [...store.resources()];
const world: WorldView = { get: (type, id) => store.get(type, id), all: (type) => (type === undefined ? all : all.filter((r) => r.resourceType === type)) };
const get = <T>(ref: string) => {
  const [type, id] = ref.split('/') as [string, string];
  return store.get(type, id) as T;
};
type Obs = { status?: string; effectiveDateTime?: string; valueQuantity?: { value?: number }; subject?: { reference?: string }; code?: { coding?: Array<{ code?: string }> } };
const age = (birth: string, on: string) => Number(on.slice(0, 4)) - Number(birth.slice(0, 4)) - (on.slice(5) < birth.slice(5) ? 1 : 0);

describe('results-inbox', () => {
  it('policy.ts applied to the world equals expected.ts', () => {
    expect(derive(world)).toEqual(expected);
  });

  it('times the screening LDCTs from the last screening study: overdue within 14 days, on schedule in its window (RBC-RAD-05 §2)', () => {
    expect(NOW_DATE).toBe('2026-10-23');
    expect(byKey('nodule_overdue', 'nodule_screening')).toMatchObject({ screening_index: '2025-09-15', overdue: true, window: { start: '2026-10-23', end: '2026-11-06' } });
    expect(byKey('nodule_scheduled', 'nodule_screening')).toMatchObject({ screening_index: '2026-04-14', overdue: false, window: { start: '2027-03-14', end: '2027-05-14' } });
  });

  it('reads each corrected potassium at its corrected value, the first value only in the note', () => {
    for (const [key, first, now] of [['corrected_up', 5.2, 6.4], ['corrected_down', 6.3, 4.4]] as const) {
      const x = byKey(key, 'corrected');
      const k = get<Obs & { note?: Array<{ text?: string }> }>(x.sources[0]!);
      expect(k.status).toBe('corrected');
      expect(k.valueQuantity?.value).toBe(now);
      expect((k.note ?? []).map((n) => n.text).join(' ')).toContain(`first reported as ${first}`);
      expect(x.reported).toBe(first);
    }
  });

  it('applies the AKI rule by the 48-hour rise and by the 7-day ratio, and not across a withdrawn value (RBC-LAB-03 §3)', () => {
    const hours = (a: Obs, b: Obs) => (Date.parse(a.effectiveDateTime!) - Date.parse(b.effectiveDateTime!)) / 3_600_000;
    const pair = (key: string) => {
      const x = expected.items.find((i) => i.key === key)!;
      return [get<Obs>(x.sources[0]!), get<Obs>(x.sources[1]!)] as const;
    };
    // Each branch clears its line by the fixture lint's 0.15 mg/dL (R7; overlay.ts lint thresholds).
    const [lp, lpEd] = pair('aki_48h');
    expect(hours(lp, lpEd)).toBeLessThanOrEqual(48);
    expect(lp.valueQuantity!.value! - (lpEd.valueQuantity!.value! + 0.3)).toBeGreaterThanOrEqual(0.15);
    const [lm, lmUc] = pair('aki_7day');
    expect(hours(lm, lmUc)).toBeGreaterThan(48);
    expect(hours(lm, lmUc)).toBeLessThanOrEqual(24 * 7);
    expect(lm.valueQuantity!.value! - 1.5 * lmUc.valueQuantity!.value!).toBeGreaterThanOrEqual(0.15);
    const [cw, cwVoid] = pair('eie_baseline');
    expect(cwVoid.status).toBe('entered-in-error');
    expect(hours(cw, cwVoid)).toBeLessThanOrEqual(48);
    expect(cw.valueQuantity!.value! - cwVoid.valueQuantity!.value!).toBeGreaterThanOrEqual(0.3);
  });

  it('gives each AKI and withdrawn-comparison patient a creatinine history that agrees with itself', () => {
    // Synthea left contradicting series (Raj Patel 2.9 with an eGFR of 6.6); the overlay sets them.
    const creatinines = (p: string) => (world.all('Observation') as unknown as Obs[]).filter((o) => o.subject?.reference === p && (o.code?.coding ?? []).some((c) => c.code === '2160-0' || c.code === '38483-4') && o.status !== 'entered-in-error');
    const range = (p: string) => creatinines(p).map((o) => o.valueQuantity!.value!);
    expect(Math.max(...range('Patient/pt-0006'))).toBeLessThan(1.1);
    expect(range('Patient/pt-0033').every((v) => v >= 1.2 && v <= 1.35)).toBe(true);
    const marsh = creatinines('Patient/pt-0013').filter((o) => o.effectiveDateTime! < '2026-10-01').map((o) => o.valueQuantity!.value!);
    expect(marsh.every((v) => v >= 0.75 && v <= 0.85)).toBe(true);
  });

  // R8 and R16 (verifier-W1-probe-T2-clinical-1 F6, F9): no chart fact that argues for a different
  // answer. A hemolyzed potassium's patient has no potassium-raising drug newly started in the last 90
  // days (a new ACE inhibitor would make paging on-call defensible; F6), and Carol Whitfield's problem
  // list carries one CKD stage (F9).
  it('leaves no chart fact that makes a different answer defensible', () => {
    type Med = { status?: string; authoredOn?: string; subject?: { reference?: string }; medicationCodeableConcept?: { coding?: Array<{ display?: string }> } };
    const RAISES_K = /pril\b|sartan\b|spironolactone|eplerenone|amiloride|triamterene|trimethoprim/i;
    for (const key of ['hemolyzed_report', 'hemolyzed_note']) {
      const x = byKey(key, 'hemolyzed');
      const drug = (m: Med) => (m.medicationCodeableConcept?.coding ?? []).map((c) => c.display).join(' ');
      const orders = (world.all('MedicationRequest') as unknown as Med[]).filter((m) => m.subject?.reference === x.patient && RAISES_K.test(drug(m)));
      // A renewal of a drug ordered before the window is not a new start (Raj Patel's lisinopril
      // has orders from 2024 on; Synthea renews it yearly).
      const recent = orders.filter((m) => m.status === 'active' && (m.authoredOn ?? '') >= '2026-07-25' && !orders.some((o) => o !== m && drug(o) === drug(m) && (o.authoredOn ?? '') < '2026-07-25'));
      expect(recent.map((m) => (m.medicationCodeableConcept?.coding ?? [])[0]?.display)).toEqual([]);
    }
    type Cond = { subject?: { reference?: string }; clinicalStatus?: { coding?: Array<{ code?: string }> }; code?: { coding?: Array<{ display?: string }> } };
    const ckd = (world.all('Condition') as unknown as Cond[])
      .filter((c) => c.subject?.reference === 'Patient/pt-0033' && c.clinicalStatus?.coding?.[0]?.code === 'active')
      .map((c) => c.code?.coding?.[0]?.display ?? '')
      .filter((d) => /chronic kidney disease stage/i.test(d));
    expect(ckd).toHaveLength(1);
    expect(ckd[0]).toMatch(/stage 3A/i);
    // Her 10-17 creatinines are drawn at the urgent care visit of that evening, not after the clinic
    // visit of the morning: each valid creatinine falls inside its own encounter.
    type Enc = { period?: { start?: string; end?: string } };
    const cw = (world.all('Observation') as unknown as Array<Obs & { encounter?: { reference?: string } }>).filter((o) => o.subject?.reference === 'Patient/pt-0033' && (o.code?.coding ?? []).some((c) => c.code === '2160-0') && (o.effectiveDateTime ?? '') >= '2026-10-01');
    for (const o of cw) {
      const e = get<Enc>(o.encounter!.reference!);
      expect(Date.parse(o.effectiveDateTime!)).toBeGreaterThanOrEqual(Date.parse(e.period!.start!));
      expect(Date.parse(o.effectiveDateTime!)).toBeLessThanOrEqual(Date.parse(e.period!.end!));
    }
  });

  it('gives each patient an age that fits the story', () => {
    const birth = (p: string) => (store.get('Patient', p) as { birthDate: string }).birthDate;
    expect(age(birth('pt-0053'), NOW_DATE)).toBe(16);
    for (const p of ['pt-0013', 'pt-0006', 'pt-0008', 'pt-0010', 'pt-0033', 'pt-0007']) expect(age(birth(p), NOW_DATE)).toBeGreaterThanOrEqual(55);
    // A FIT is a screening test from 45 to 75 (USPSTF 2021).
    const ondricka = age(birth('pt-0016'), NOW_DATE);
    expect(ondricka).toBeGreaterThanOrEqual(45);
    expect(ondricka).toBeLessThanOrEqual(75);
    // Lung cancer screening is for 50 to 80 (USPSTF 2021).
    for (const p of ['pt-0013', 'pt-0006']) expect(age(birth(p), NOW_DATE)).toBeLessThanOrEqual(80);
  });

  it('files every preliminary report before its final one, and every corrected or withdrawn value before today', () => {
    for (const key of ['prelim_positive', 'prelim_negative']) {
      const x = byKey(key, 'preliminary');
      const focus = get<{ focus: { reference: string } }>(x.task).focus.reference;
      const [p, f] = [get<{ issued: string; status: string }>(focus), get<{ issued: string; status: string }>(x.final)];
      expect(x.sources).toEqual([x.final]);
      expect([p.status, f.status]).toEqual(['preliminary', 'final']);
      expect(Date.parse(p.issued)).toBeLessThan(Date.parse(f.issued));
      expect(Date.parse(f.issued)).toBeLessThan(Date.parse('2026-10-23T08:00:00-04:00'));
    }
  });

  // The overlay cannot read instruction.md or the policy files, so their prompt-date, weekday and
  // leakage checks run here, over the committed world.
  it('states no date the clock gives and no answer in the prompt or policy text', async () => {
    const task = await nodeTaskSource({ testMode: false }).get('results-inbox');
    const texts = [task.instruction, ...task.policies.map((p) => p.text)];
    const answers = ['2026-11-06', '2027-03-14', '2027-05-14', '2027-04-14', '2026-11-05', '2026-10-26'];
    const findings = lintWorld(all, [{ source: 'results-inbox', spec: { prompts: texts, leakage: { answers, texts: texts.map((text, i) => ({ source: i === 0 ? 'instruction.md' : task.policies[i - 1]!.id, text })) } } }]);
    expect(findings).toEqual([]);
  });
});
