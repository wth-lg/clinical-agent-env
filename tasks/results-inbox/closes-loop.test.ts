// items_closed on an existing order (verifier-W1-probe-T2-clinical-2 N6): RBC-INBOX-01 §3 lets a
// closure link "the existing order that already does" close the loop. No actionable item's patient
// has such an order on this chart, so no matrix case can show it; these synthetic contexts do. An
// existing order counts when it was active at the start and still is, is the item's patient's, and
// carries one of the codes the item's orders may carry.
import { describe, expect, it } from 'vitest';
import type { GateCheck, GateCtx } from '../../packages/grader/check.ts';
import { expected } from './expected.ts';
import { checks } from './tests/grader.ts';

type R = { resourceType: string; id: string; status?: string; [k: string]: unknown };
const view = (rs: R[]) =>
  ({
    has: (t: string, id: string) => rs.some((r) => r.resourceType === t && r.id === id),
    status: (t: string, id: string) => rs.find((r) => r.resourceType === t && r.id === id)?.status ?? null,
    get: (t: string, id: string) => rs.find((r) => r.resourceType === t && r.id === id),
    all: (t?: string) => (t === undefined ? rs : rs.filter((r) => r.resourceType === t)),
  }) as unknown as GateCtx['final'];

const x = expected.items.find((i) => i.key === 'hemolyzed_note')!;
const taskId = x.task.split('/')[1]!;
const order = (over: Partial<R> = {}): R => ({
  resourceType: 'ServiceRequest', id: 'sr-existing', status: 'active', priority: 'urgent',
  subject: { reference: x.patient }, code: { coding: [{ system: 'http://loinc.org', code: '51990-0' }] }, ...over,
});

// The item completed, its closure linking only the existing order; nothing else written.
function closed(before: R, after: R = before): boolean {
  const task = (status: string, output?: unknown): R => ({ resourceType: 'Task', id: taskId, status, owner: { reference: 'Practitioner/pr-okafor' }, ...(output ? { output } : {}) });
  const ctx: GateCtx = {
    initial: view([before, task('requested')]),
    final: view([after, task('completed', [{ valueReference: { reference: `ServiceRequest/${before.id}` } }])]),
    diff: { created: [], updated: [], deleted: [] } as never,
    steps: [],
    exposedAt: () => null,
    writes: () => [x.task],
  };
  const gate = checks.find((c): c is GateCheck => c.kind === 'gate' && c.id === 'items_closed')!;
  return gate.fn(ctx).items!.find((i) => i.item === x.key)!.met;
}

describe('results-inbox items_closed on an existing order', () => {
  it('closes the loop with an existing active order of the right kind for the patient', () => {
    expect(closed(order())).toBe(true);
  });
  it('does not with an existing order of another kind', () => {
    expect(closed(order({ code: { coding: [{ system: 'urn:riverbend:orders', code: 'REF-GI-COLONOSCOPY' }] } }))).toBe(false);
  });
  it("does not with another patient's order", () => {
    expect(closed(order({ subject: { reference: 'Patient/pt-0006' } }))).toBe(false);
  });
  it('does not with an order that was not active at the start, or that the trial cancelled', () => {
    expect(closed(order({ status: 'completed' }))).toBe(false);
    expect(closed(order(), order({ status: 'revoked' }))).toBe(false);
  });
});
