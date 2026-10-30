// A gate that counts a decisive id as seen by more than exposure or a shown phrase declares how
// in seen_at, and attribution reads the same rule, so the label agrees with the gate: T2's
// screening LDCT counts as seen from a fhir_search row that shows its conclusion
// (verifier-phase-P19-T2-1 D1, builder-186). A gate without seen_at keeps the old rule.
import { describe, expect, it } from 'vitest';
import { attribute } from '../attribution.ts';
import { gate, type GateCheck, type Step } from '../check.ts';
import type { CheckResult } from '../grade.ts';

const REPORT = 'DiagnosticReport/dr-1';
const step = (n: number, tool: string, referenced: string[] = []): Step => ({ n, turn: n, tool, exposed_ids: [], referenced_ids: referenced, written_ids: [], shown: {} }) as unknown as Step;
const steps = [step(1, 'fhir_search', [REPORT]), step(2, 'order_service')];
const failed: CheckResult = { id: 'G1', kind: 'gate', method: 'code', category: 'reasoning', points: null, met: false, evidence: {} } as CheckResult;
const G = (extra: Partial<GateCheck> = {}) => gate({ id: 'G1', category: 'reasoning', traces_to: 't', decisive_ids: [REPORT], decisive_phrases: { [REPORT]: 'Lung-RADS 2' }, fn: () => ({ met: false, evidence: {} }), ...extra });
const rowStep = (s: readonly Step[]) => s.find((x) => x.tool === 'fhir_search' && x.referenced_ids.includes(REPORT))?.n ?? null;

describe('attribution with a gate that declares seen_at', () => {
  it('is reasoning when seen_at finds the id seen, and the exposure record names the step', () => {
    const a = attribute('FAIL', [G({ seen_at: { [REPORT]: rowStep } })], [failed], steps);
    expect(a?.auto).toBe('reasoning');
    expect(a?.exposure).toEqual([{ id: REPORT, first_exposed_step: null, first_shown_step: null, first_seen_step: 1 }]);
  });

  it('is retrieval when seen_at finds nothing', () => {
    expect(attribute('FAIL', [G({ seen_at: { [REPORT]: () => null } })], [failed], steps)?.auto).toBe('retrieval');
  });

  it('without seen_at keeps the shown-phrase rule', () => {
    const a = attribute('FAIL', [G()], [failed], steps);
    expect(a?.auto).toBe('retrieval');
    expect(a?.exposure).toEqual([{ id: REPORT, first_exposed_step: null, first_shown_step: null }]);
  });
});
