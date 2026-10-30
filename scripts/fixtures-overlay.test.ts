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
      ids: {},
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
      ids: {},
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

  // The id registry (packages/env/overlay.ts, "Planted ids"): each overlay declares every
  // resource it adds under a registry key, and the world gets the neutral id the key maps to.
  const T1 = 'Patient/pt-0002';
  const obs = (id: string, extra: object = {}): Resource => ({ resourceType: 'Observation', id, status: 'final', code: { text: 'x' }, subject: { reference: T1 }, ...extra }) as Resource;
  const one = (o: Partial<Overlay> & Pick<Overlay, 'build'>, more: Overlay[] = []) => applyOverlays(base, SETTING, SETTING_LINT, [{ task: 'T1', ids: {}, ...o }, ...more]);

  it('gives a planted resource its neutral id and points every reference and lint entry at it', () => {
    const { resources, lint } = one({
      ids: { 'obs-t1-scr': 'obs-09001', 'enc-t1-visit': 'enc-09001' },
      build: () => ({
        put: [{ resourceType: 'Encounter', id: 'enc-t1-visit', status: 'finished', class: { code: 'AMB' }, subject: { reference: T1 } } as Resource, obs('obs-t1-scr', { encounter: { reference: 'Encounter/enc-t1-visit' } })],
        lint: { thresholds: [{ quantity: 'scr', threshold: 1.5, observation: 'obs-t1-scr' }] },
      }),
    });
    const planted = resources.filter((r) => r.id!.endsWith('09001'));
    expect(planted.map((r) => `${r.resourceType}/${r.id}`).sort()).toEqual(['Encounter/enc-09001', 'Observation/obs-09001']);
    expect((planted.find((r) => r.resourceType === 'Observation') as { encounter: unknown }).encounter).toEqual({ reference: 'Encounter/enc-09001' });
    expect(JSON.stringify(resources)).not.toMatch(/-t1-/);
    expect(lint.find((l) => l.source === 'T1')!.spec).toEqual({ thresholds: [{ quantity: 'scr', threshold: 1.5, observation: 'obs-09001' }] });
  });

  it('refuses an added resource the registry does not declare, and names the file and a free id', () => {
    expect(() => one({ build: () => ({ put: [obs('obs-t1-scr')] }) })).toThrow(/tasks\/renal-dose-review\/ids\.ts.*'obs-t1-scr': 'obs-\d{5}'/);
  });

  it('refuses a declared key the overlay never adds', () => {
    expect(() => one({ ids: { 'obs-t1-scr': 'obs-09001' }, build: () => ({}) })).toThrow(/obs-t1-scr.*never adds/);
  });

  it("refuses a key outside the task's namespace", () => {
    expect(() => one({ ids: { 'obs-t2-scr': 'obs-09001' }, build: () => ({ put: [obs('obs-t2-scr')] }) })).toThrow(/obs-t2-scr/);
  });

  it('refuses a world id that is tagged, descriptive, or of another type', () => {
    for (const bad of ['obs-t1-scr', 'obs-scr-1020', 'obs-creatinine', 'cond-09001', 'obs-9001x']) {
      expect(() => one({ ids: { 'obs-t1-scr': bad }, build: () => ({ put: [obs('obs-t1-scr')] }) }), bad).toThrow(/obs-t1-scr/);
    }
  });

  it('allows a name-shaped id for a Practitioner, Organization or Group only', () => {
    const pr: Resource = { resourceType: 'Practitioner', id: 'pr-t1-raman', name: [{ family: 'Raman' }] };
    expect(one({ ids: { 'pr-t1-raman': 'pr-raman' }, build: () => ({ put: [pr] }) }).resources.some((r) => r.id === 'pr-raman')).toBe(true);
    expect(() => one({ ids: { 'obs-t1-scr': 'obs-raman' }, build: () => ({ put: [obs('obs-t1-scr')] }) })).toThrow(/obs-t1-scr/);
  });

  it('refuses a world id two tasks claim, or one the base or setting already has', () => {
    const t2: Overlay = { task: 'T2', ids: { 'obs-t2-k': 'obs-09001' }, build: () => ({ put: [{ ...obs('obs-t2-k'), subject: { reference: 'Patient/pt-0006' } } as Resource] }) };
    expect(() => one({ ids: { 'obs-t1-scr': 'obs-09001' }, build: () => ({ put: [obs('obs-t1-scr')] }) }, [t2])).toThrow(/obs-09001.*T1.*T2|obs-09001.*T2.*T1/);
    expect(() => one({ ids: { 'pr-t1-raman': 'pr-okafor' }, build: () => ({ put: [{ resourceType: 'Practitioner', id: 'pr-t1-raman' } as Resource] }) })).toThrow(/pr-okafor/);
  });

  it('refuses a registry key left anywhere in what the overlay writes', () => {
    expect(() => one({ ids: { 'obs-t1-scr': 'obs-09001' }, build: () => ({ put: [obs('obs-t1-scr', { note: [{ text: 'repeat of obs-t1-scr' }] })] }) })).toThrow(/obs-t1-scr.*registry key/);
  });
});
