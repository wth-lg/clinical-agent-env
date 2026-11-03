// T1's lever items (plan-amendment-w5 W5-E, builder-299): A (a silent newer creatinine in a routed
// outside batch), B (a copied-forward medication block in an outside letter) and the reserve (the
// §2 branch of an inhibitor at a criteria dose of 2.5 mg), each a toggle in expected.ts LEVER
// (G1). An inactive item's expected entry and event are absent and its patient is off the list;
// every lever Patient is built in every state at a fixed id slot (verifier 214 F3). The world must
// be built for the LEVER the checkout declares: each active item's patient is on the list and in
// the Group, and no inactive one is.
import { describe, expect, it } from 'vitest';
import { matrixEnv } from '../../../cli/matrix.ts';
import { loadStore } from '../../../packages/env/fixture-source.ts';
import { ACTIVE, SPECS } from '../events.ts';
import { expected, LEVER_ITEMS } from '../expected.ts';
import { LEVER } from '../lever.ts';
import { IDS } from '../ids.ts';

const world = await loadStore(matrixEnv().world);
const ITEM_IDS = ['A', 'B', 'reserve'] as const;

describe('T1 lever items (W5-E)', () => {
  it('declares A, B and the reserve as lever items; LEVER names only them, each once', () => {
    expect(LEVER_ITEMS.map((i) => i.id)).toEqual([...ITEM_IDS]);
    expect(LEVER_ITEMS.map((i) => i.kind)).toEqual(['A', 'B', 'B']);
    expect(LEVER.every((id) => (ITEM_IDS as readonly string[]).includes(id))).toBe(true);
    expect(new Set(LEVER).size).toBe(LEVER.length);
    for (const i of LEVER_ITEMS) expect(i.sibling.length, `${i.id} sibling`).toBeGreaterThan(0);
  });

  it('every lever Patient is built in every LEVER state at a fixed id slot (pt-0061 A, pt-0062 B, pt-0063 reserve); only list membership toggles', () => {
    expect(LEVER_ITEMS.map((i) => `${i.id} ${i.item}`)).toEqual(['A Patient/pt-0062', 'B Patient/pt-0061', 'reserve Patient/pt-0063']);
    for (const i of LEVER_ITEMS) {
      expect(Object.hasOwn(IDS, i.key), `${i.id} in the registry`).toBe(true);
      expect(world.get('Patient', i.patient), `${i.id} patient in the world`).toBeDefined();
      const on = i.id === 'A' || LEVER.includes(i.id);
      expect(expected.items.some((x) => x.patient === i.item), `${i.id} on the list`).toBe(on);
      const group = world.get('Group', 'grp-doac-review') as { member: Array<{ entity: { reference: string } }> };
      expect(group.member.some((m) => m.entity.reference === i.item), `${i.id} in the Group`).toBe(on);
    }
  });

  it("A's event is an active spec exactly when A is active, and carries the silent sibling", () => {
    const a = LEVER_ITEMS.find((i) => i.id === 'A')!;
    expect(a.spec).toBe('fairweather-scr-batch');
    expect(ACTIVE.includes(a.spec!)).toBe(LEVER.includes('A'));
    const spec = SPECS.find((s) => s.id === a.spec);
    expect(spec !== undefined).toBe(LEVER.includes('A'));
    if (spec) expect(a.sibling).toEqual([`Observation/${spec.resources[1]!.id}`]);
  });
});
