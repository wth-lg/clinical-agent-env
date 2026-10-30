// Overlay isolation (packages/env/overlay.ts) as fixtures:build applies it: each overlay reads
// the base and setting only, never what another overlay tried to write.
import { describe, expect, it } from 'vitest';
import { applyOverlays, type Overlay, type WorldReader } from '../packages/env/overlay.ts';
import type { Resource } from '../packages/env/store.ts';
import { SETTING, SETTING_LINT } from '../packages/env/world.ts';

describe('overlays', () => {
  const base: Resource[] = [
    { resourceType: 'Patient', id: 'pt-0040', name: [{ family: 'Base' }] },
    ...Object.values({ T1: ['pt-0002', 'pt-0003'], T2: ['pt-0006', 'pt-0007', 'pt-0008', 'pt-0010', 'pt-0013', 'pt-0016', 'pt-0033', 'pt-0053'] })
      .flat()
      .map((id): Resource => ({ resourceType: 'Patient', id })),
    ...['pt-0009', 'pt-0011', 'pt-0014', 'pt-0017', 'pt-0018', 'pt-0019', 'pt-0020', 'pt-0021', 'pt-0022', 'pt-0023', 'pt-0024', 'pt-0025', 'pt-0034', 'pt-0035']
      .concat(['pt-0004', 'pt-0005', 'pt-0012', 'pt-0015', 'pt-0026', 'pt-0027', 'pt-0028', 'pt-0029', 'pt-0030', 'pt-0031'])
      .map((id): Resource => ({ resourceType: 'Patient', id })),
  ];

  it('one overlay cannot write into what the next one reads', () => {
    const attempts: string[] = [];
    const t1: Overlay = {
      task: 'T1',
      build(world) {
        const sneak: Resource = { resourceType: 'Communication', id: 'comm-t1-x', status: 'completed', subject: { reference: 'Patient/pt-0040' } };
        const put = (world as WorldReader & { put?: unknown }).put;
        if (typeof put === 'function') {
          try {
            put.call(world, sneak);
            attempts.push('put ran');
          } catch {
            attempts.push('put threw');
          }
        }
        try {
          (world.get('Patient', 'pt-0040') as { name: unknown }).name = [{ family: 'Changed' }];
          attempts.push('mutation ran');
        } catch {
          attempts.push('mutation threw');
        }
        return {};
      },
    };
    let seen: unknown[] = [];
    const t2: Overlay = {
      task: 'T2',
      build(world) {
        seen = [world.get('Communication', 'comm-t1-x'), (world.get('Patient', 'pt-0040') as { name?: unknown } | undefined)?.name, world.size];
        return {};
      },
    };
    applyOverlays(base, SETTING, SETTING_LINT, [t1, t2]);
    expect(attempts).not.toContain('put ran');
    expect(attempts).not.toContain('mutation ran');
    expect(seen).toEqual([undefined, [{ family: 'Base' }], base.length + SETTING.length]);
  });

  // Planted ids (packages/env/overlay.ts): an overlay adds resources under registry keys, and the
  // build numbers the whole world by Synthea's rule, planted and base resources in one sequence.
  const T1 = 'Patient/pt-0002';
  const obs = (id: string, extra: object = {}): Resource => ({ resourceType: 'Observation', id, status: 'final', code: { text: 'x' }, subject: { reference: T1 }, ...extra }) as Resource;
  const one = (o: Partial<Overlay> & Pick<Overlay, 'build'>, more: Overlay[] = [], extra: Resource[] = []) => applyOverlays([...base, ...extra], SETTING, SETTING_LINT, [{ task: 'T1', ...o }, ...more]);

  it("numbers a planted resource inside its patient's block by date and points every reference and lint entry at it", () => {
    const at = (id: string, patient: string, date: string) => obs(id, { subject: { reference: `Patient/${patient}` }, effectiveDateTime: date });
    const baseObs = [at('obs-00001', 'pt-0002', '2026-01-01'), at('obs-00002', 'pt-0002', '2026-09-01'), at('obs-00003', 'pt-0040', '2026-02-01')];
    const { resources, lint, ids, synthea } = one(
      {
        build: () => ({
          put: [
            { resourceType: 'Encounter', id: 'enc-t1-visit', status: 'finished', class: { code: 'AMB' }, subject: { reference: T1 }, period: { start: '2026-06-01' } } as Resource,
            at('obs-t1-scr', 'pt-0002', '2026-06-01'),
            { ...at('obs-t1-k', 'pt-0002', '2026-10-01'), encounter: { reference: 'Encounter/enc-t1-visit' }, derivedFrom: [{ reference: 'Observation/obs-00002' }] } as Resource,
          ],
          lint: { thresholds: [{ quantity: 'scr', threshold: 1.5, observation: 'obs-t1-scr' }, { quantity: 'potassium', threshold: 5, observation: 'obs-00003' }] },
        }),
      },
      [],
      baseObs,
    );
    expect(ids.T1).toEqual({ 'enc-t1-visit': 'enc-00001', 'obs-t1-k': 'obs-00004', 'obs-t1-scr': 'obs-00002' });
    expect(synthea).toEqual({ 'obs-00001': 'obs-00001', 'obs-00002': 'obs-00003', 'obs-00003': 'obs-00005' });
    const k = resources.find((r) => r.id === 'obs-00004') as { encounter: unknown; derivedFrom: unknown };
    expect([k.encounter, k.derivedFrom]).toEqual([{ reference: 'Encounter/enc-00001' }, [{ reference: 'Observation/obs-00003' }]]);
    expect(JSON.stringify(resources)).not.toMatch(/-t1-/);
    expect(lint.find((l) => l.source === 'T1')!.spec).toEqual({ thresholds: [{ quantity: 'scr', threshold: 1.5, observation: 'obs-00002' }, { quantity: 'potassium', threshold: 5, observation: 'obs-00005' }] });
  });

  it("refuses an added resource whose id is not one of its task's registry keys", () => {
    for (const bad of ['obs-scr', 'obs-t2-scr', 'obs-09001', 'obs-t1-']) expect(() => one({ build: () => ({ put: [obs(bad)] }) }), bad).toThrow(/registry key of T1/);
  });

  it('gives a Practitioner, Organization or Group its name, and nothing else a name', () => {
    const pr: Resource = { resourceType: 'Practitioner', id: 'pr-t1-raman', name: [{ family: 'Raman' }] };
    expect(one({ names: { 'pr-t1-raman': 'pr-raman' }, build: () => ({ put: [pr] }) }).resources.some((r) => r.id === 'pr-raman')).toBe(true);
    expect(() => one({ build: () => ({ put: [pr] }) })).toThrow(/takes a name/);
    expect(() => one({ names: { 'obs-t1-scr': 'obs-raman' }, build: () => ({ put: [obs('obs-t1-scr')] }) })).toThrow(/numbered by fixtures:build/);
  });

  it('refuses a name of the wrong form, one two tasks claim, one the base or setting has, or one never added', () => {
    const pr = (id: string): Resource => ({ resourceType: 'Practitioner', id });
    for (const bad of ['pr-t1', 'org-raman', 'pr-00001', 'pr-Raman']) expect(() => one({ names: { 'pr-t1-raman': bad }, build: () => ({ put: [pr('pr-t1-raman')] }) }), bad).toThrow(/pr-t1-raman/);
    const t2: Overlay = { task: 'T2', names: { 'pr-t2-raman': 'pr-raman' }, build: () => ({ put: [pr('pr-t2-raman')] }) };
    expect(() => one({ names: { 'pr-t1-raman': 'pr-raman' }, build: () => ({ put: [pr('pr-t1-raman')] }) }, [t2])).toThrow(/pr-raman.*T1.*T2/);
    expect(() => one({ names: { 'pr-t1-raman': 'pr-okafor' }, build: () => ({ put: [pr('pr-t1-raman')] }) })).toThrow(/pr-okafor/);
    expect(() => one({ names: { 'pr-t1-raman': 'pr-raman' }, build: () => ({}) })).toThrow(/pr-t1-raman.*never adds/);
  });

  it('refuses a registry key left anywhere in what the overlay writes', () => {
    expect(() => one({ build: () => ({ put: [obs('obs-t1-scr', { note: [{ text: 'repeat of obs-t1-scr' }] })] }) })).toThrow(/obs-t1-scr.*registry key/);
  });

  it('refuses a registry key inside a text attachment, decoded', () => {
    const doc = (text: string, contentType = 'text/plain'): Resource =>
      ({ resourceType: 'DocumentReference', id: 'doc-t1-note', status: 'current', subject: { reference: T1 }, content: [{ attachment: { contentType, data: Buffer.from(text).toString('base64') } }] }) as Resource;
    const put = (text: string, contentType?: string) => () => one({ build: () => ({ put: [doc(text, contentType), obs('obs-t1-scr')] }) });
    expect(put('Creatinine 1.9 (obs-t1-scr), repeat in a week.')).toThrow(/doc-t1-note.*'obs-t1-scr' is a registry key/);
    expect(put('see obs-t1-scr', 'text/html; charset=utf-8')).toThrow(/'obs-t1-scr' is a registry key/);
    expect(put('Creatinine 1.9, repeat in a week.')).not.toThrow();
  });
});
