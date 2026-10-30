// Double derivation for T3 (design section 4, "Double derivation"): policy.ts applied to the
// committed world must give expected.ts, and the panel must hold the design's twelve cases. The
// matrix checks the same equality; this test shows it on its own.
import { describe, expect, it } from 'vitest';
import { nodeTaskSource } from '../../cli/adapters/tasks-node.ts';
import { matrixEnv } from '../../cli/matrix.ts';
import { clock } from '../../packages/env/clock.ts';
import { loadStore } from '../../packages/env/fixture-source.ts';
import { lintWorld } from '../../packages/env/lint/index.ts';
import { READ_TOOLS, type ReadContext } from '../../packages/env/tools/read/index.ts';
import { callTool } from '../../packages/env/tools/registry.ts';
import type { WorldView } from '../../packages/grader/matrix/types.ts';
import { expected } from './expected.ts';
import { derive } from './policy.ts';

const store = await loadStore(matrixEnv().world);
const all = [...store.resources()];
const world: WorldView = { get: (type, id) => store.get(type, id), all: (type) => (type === undefined ? all : all.filter((r) => r.resourceType === type)) };

describe('crc-care-gap', () => {
  it('policy.ts applied to the world equals expected.ts', () => {
    expect(derive(world)).toEqual(expected);
  });

  it('orders for exactly the design six: E2, E3, E4, E8, E10 and E16', () => {
    const d = derive(world) as unknown as typeof expected;
    expect(d.members.filter((x) => x.order).map((x) => x.patient)).toEqual(['Patient/pt-0017', 'Patient/pt-0018', 'Patient/pt-0019', 'Patient/pt-0022', 'Patient/pt-0023', 'Patient/pt-0035']);
  });

  // The overlay's own resources carry the screening history; a Synthea leftover that mentions
  // colon screening (a check-up coded 'Screening for malignant neoplasm of colon', a note listing
  // a colonoscopy) would contradict a member's answer.
  const SLOTS = expected.members.map((x) => x.patient);
  const onSlots = all.filter((r) => SLOTS.some((p) => JSON.stringify(r).includes(`"${p}"`)));
  const text = (r: (typeof all)[number]) =>
    JSON.stringify(r) + (r.resourceType === 'DocumentReference' ? r.content.map((c) => (c.attachment.data ? new TextDecoder().decode(Uint8Array.from(atob(c.attachment.data), (ch) => ch.charCodeAt(0))) : '')).join('\n') : '');
  const notesOf = (p: string) => onSlots.filter((r) => r.resourceType === 'DocumentReference' && r.subject?.reference === p && r.id !== 'doc-t3-1856');

  it('has no slot resource outside the overlay that mentions colon screening', () => {
    const mentions = onSlots.filter((r) => !r.id!.includes('-t3-') && /colon|colorectal|275978004|occult|fecal|sigmoid|\bFIT\b/i.test(text(r))).map((r) => `${r.resourceType}/${r.id}`);
    expect(mentions).toEqual([]);
  });

  it('keeps neutral Synthea notes on every slot, none stating an age', () => {
    for (const p of SLOTS) expect(notesOf(p).length, p).toBeGreaterThan(0);
    const aged = SLOTS.flatMap(notesOf).filter((r) => /\b\d+[ -]years?[ -]old\b/i.test(text(r))).map((r) => r.id);
    expect(aged).toEqual([]);
  });

  it('resolves the Synthea leftovers a clinician would notice', () => {
    const status = (type: string, id: string) => {
      const r = store.get(type, id) as { status?: string; clinicalStatus?: { coding?: Array<{ code?: string }> } } | undefined;
      return r?.clinicalStatus?.coding?.[0]?.code ?? r?.status;
    };
    // Full-time employment on frail E7 and E8, a 1998 anemia on E3, a 2024 alteplase dose on E12.
    expect(['cond-00231', 'cond-00452', 'cond-00425'].map((id) => status('Condition', id))).toEqual(['resolved', 'resolved', 'resolved']);
    expect(status('MedicationRequest', 'mr-00269')).toBe('completed');
  });

  it('dates the scanned operative note by its scan, with the surgery as its period', () => {
    const doc = store.get('DocumentReference', 'doc-t3-1856') as { date?: string; context?: { period?: { start?: string } } };
    expect(doc.date?.slice(0, 10)).toBe('2015-07-14');
    expect(doc.context?.period?.start?.slice(0, 10)).toBe('2015-06-03');
  });

  it('records the colectomy only in a note, never as a coded Procedure or Condition', () => {
    const coded = all.filter((r) => (r.resourceType === 'Procedure' || r.resourceType === 'Condition') && JSON.stringify(r).includes('Patient/pt-0021') && /colectomy/i.test(JSON.stringify(r)));
    expect(coded).toEqual([]);
  });

  // P19 (reports/researcher-16.md T3): E15's long-term nursing home residence is structured data
  // only, and E16's skilled nursing stay is short rehab that ended at home.
  describe('the nursing home pair', () => {
    const ctx: ReadContext = { world: store, clock, policies: [], catalog: [] };
    const tool = (name: string, input: unknown) => callTool(READ_TOOLS, name, input, ctx);
    const HOUSING = 'Observation/obs-t3-2465';

    // The fault rule (task.toml): E15 not excluded is a model fault when any of these ran.
    it.each([
      ['category=social-history', { category: 'social-history' }],
      ['code=71802-3', { code: '71802-3' }],
      ['date_ge=2026', { date_ge: '2026-01-01' }],
      ['sort=-date', { sort: '-date' }],
    ])("an Observation search for E15 by %s shows his housing status on page 1", (_label, filter) => {
      expect(tool('fhir_search', { resource_type: 'Observation', patient: 'pt-0034', ...filter }).exposed_ids).toContain(HOUSING);
    });

    it('an Encounter search for E15 shows the nursing facility visit, and his Patient read the facility address', () => {
      expect(tool('fhir_search', { resource_type: 'Encounter', patient: 'pt-0034' }).exposed_ids).toContain('Encounter/enc-t3-7781');
      expect(JSON.stringify(tool('fhir_read', { resource_type: 'Patient', id: 'pt-0034' }).content)).toContain('Maple Grove Care Center');
    });

    it("no note names E15's nursing home, and a notes search for one finds only E16's rehab stay", () => {
      const e15 = all.filter((r) => r.resourceType === 'DocumentReference' && r.subject?.reference === 'Patient/pt-0034');
      expect(e15.length).toBeGreaterThan(0);
      expect(e15.filter((r) => /nursing|care cent|maple grove|facility/i.test(text(r))).map((r) => r.id)).toEqual([]);
      const hits = tool('search_notes', { query: 'nursing home' }).referenced_ids;
      expect(hits).toContain('DocumentReference/doc-t3-6193');
      expect(hits).not.toContain('Patient/pt-0034');
    });

    it("E16's newest housing status, after his stay, says he lives in his own home", () => {
      const housing = all
        .filter((r) => r.resourceType === 'Observation' && r.subject?.reference === 'Patient/pt-0035' && r.code.coding?.some((c) => c.code === '71802-3'))
        .map((r) => r as typeof r & { effectiveDateTime: string; valueCodeableConcept: { coding: Array<{ code: string }> } })
        .sort((a, b) => b.effectiveDateTime.localeCompare(a.effectiveDateTime));
      expect(housing[0]?.valueCodeableConcept.coding[0]?.code).toBe('LA18839-3');
      const stay = store.get('Encounter', 'enc-t3-4609') as { period?: { end?: string } };
      expect(housing[0]!.effectiveDateTime > stay.period!.end!).toBe(true);
    });
  });

  // The overlay cannot read instruction.md or the policy file, so their prompt-date, weekday and
  // leakage checks run here, over the committed world.
  it('states no date the clock gives and no answer in the prompt or policy text', async () => {
    const task = await nodeTaskSource({ testMode: false }).get('crc-care-gap');
    const texts = [task.instruction, ...task.policies.map((p) => p.text)];
    const answers = expected.members.map((x) => x.family);
    const findings = lintWorld(all, [{ source: 'crc-care-gap', spec: { prompts: texts, leakage: { answers, texts: texts.map((text, i) => ({ source: i === 0 ? 'instruction.md' : 'RBC-QM-02', text })) } } }]);
    expect(findings).toEqual([]);
  });
});
