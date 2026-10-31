// A mutant of a worklist task may declare the items it fails and each one's label (Mutant.items),
// so a probe can show each item's mutant failing only that item under its expected label
// (plan-amendment-worklist W1 gate). The matrix checks the declaration against the grade's item
// labels (attribution.ts items); a mutant that declares none is reported as before.
import { describe, expect, it } from 'vitest';
import type { Taxonomy } from '../../attribution.ts';
import type { GateCtx } from '../../check.ts';
import { itemGate, OUTSIDE } from '../../items.ts';
import type { Mutant } from '../types.ts';
import { matrix, ONE, TOY } from './harness.ts';

// One item, pt-0001's chart, which needs a note; a note on any other chart is the outside item.
const notesOn = (ctx: GateCtx) => ctx.writes().filter((k) => k.startsWith('DocumentReference/')).map((k) => ctx.final.get('DocumentReference', k.slice('DocumentReference/'.length))?.subject?.reference ?? '');
const noteItems = itemGate<string, string[]>({
  id: 'note_items',
  category: 'action',
  traces_to: 'instruction.md:5',
  items: ['Patient/pt-0001'],
  key: (p) => p,
  decisive: (p) => [p],
  prepare: notesOn,
  check: (p, on) => (on.includes(p) ? { met: true } : { met: false, why: 'no note on this chart' }),
  outside: (on) => (on.some((p) => p !== 'Patient/pt-0001') ? { met: false, why: 'a note on another chart' } : { met: true }),
});
const WRONG = TOY.mutants.find((m) => m.id === 'note_on_wrong_patient')!;
const run = (items?: Record<string, Taxonomy>) => {
  const m: Mutant = { ...WRONG, fails: [...WRONG.fails, 'note_items'], ...(items ? { items } : {}) };
  return matrix({ checks: [...TOY.checks, noteItems], mutants: TOY.mutants.map((x) => (x.id === WRONG.id ? m : x)) }, { ...ONE, cases: [WRONG.id] });
};
const line = (text: string) => text.split('\n').find((l) => l.startsWith(`  mutant ${WRONG.id} `))!;

describe('a mutant\'s item declaration', () => {
  it('holds when the failed items and their labels are the ones declared, and the line shows both', async () => {
    const { code, text } = await run({ 'Patient/pt-0001': 'retrieval', [OUTSIDE]: 'reasoning' });
    expect(code).toBe(0);
    expect(line(text)).toMatch(/, items \{Patient\/pt-0001 retrieval, outside reasoning\} declared \{Patient\/pt-0001 retrieval, outside reasoning\} ok$/);
  });

  it('fails the matrix on a missing, an extra or a mislabelled item', async () => {
    for (const items of [{ 'Patient/pt-0001': 'retrieval' }, { 'Patient/pt-0001': 'retrieval', [OUTSIDE]: 'reasoning', 'Patient/pt-0002': 'reasoning' }, { 'Patient/pt-0001': 'reasoning', [OUTSIDE]: 'reasoning' }] as Array<Record<string, Taxonomy>>) {
      const { code, text } = await run(items);
      expect(code, JSON.stringify(items)).toBe(1);
      expect(line(text), JSON.stringify(items)).toMatch(/ MISMATCH$/);
      expect(text, JSON.stringify(items)).toMatch(/items \{Patient\/pt-0001 retrieval, outside reasoning\}, declared \{/);
    }
  });

  it('a mutant that declares no items is reported as before', async () => {
    const { code, text } = await run();
    expect(code).toBe(0);
    expect(line(text)).not.toMatch(/items \{/);
    expect(line(text)).toMatch(/ ok$/);
  });
});
