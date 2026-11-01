// items_closed and item_orders on an existing order (verifier-W1-probe-T2-clinical-2 N6 and
// verifier-W1-probe-T2-clinical-3 N11): RBC-INBOX-01 §3 lets a closure link "the existing order that
// already does" close the loop, and RBC-GI-01 §2 says to link an existing order and not place another. No actionable item's patient
// has such an order on this chart, so no matrix case can show it; these synthetic contexts do. An
// existing order counts when it was active at the start and still is, is the item's patient's, and
// carries one of the codes the item's orders may carry; for item_orders it must also meet the item's
// priority and date, as a new order must.
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
  return verdict('items_closed', before, after);
}
function verdict(gateId: string, before: R, after: R = before): boolean {
  const task = (status: string, output?: unknown): R => ({ resourceType: 'Task', id: taskId, status, owner: { reference: 'Practitioner/pr-okafor' }, ...(output ? { output } : {}) });
  const ctx: GateCtx = {
    initial: view([before, task('requested')]),
    final: view([after, task('completed', [{ valueReference: { reference: `ServiceRequest/${before.id}` } }])]),
    diff: { created: [], updated: [], deleted: [] } as never,
    steps: [],
    exposedAt: () => null,
    writes: () => [x.task],
  };
  const gate = checks.find((c): c is GateCheck => c.kind === 'gate' && c.id === gateId)!;
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

// item_orders for hemolyzed_note: an urgent repeat BMP by Monday 2026-10-26 (RBC-LAB-03 §2). The
// existing order starts on Saturday 2026-10-24.
describe('results-inbox item_orders on an existing order', () => {
  const ordered = (before: R, after: R = before) => verdict('item_orders', before, after);
  const due = { occurrenceDateTime: '2026-10-24' };
  it('is met by an existing active urgent BMP for the patient by the item\'s day', () => {
    expect(ordered(order(due))).toBe(true);
  });
  it('is not met by an existing order that misses the priority or the day', () => {
    expect(ordered(order({ ...due, priority: 'routine' }))).toBe(false);
    expect(ordered(order({ occurrenceDateTime: '2026-11-02' }))).toBe(false);
  });
  it("is not met by another patient's order or one of another kind", () => {
    expect(ordered(order({ ...due, subject: { reference: 'Patient/pt-0006' } }))).toBe(false);
    expect(ordered(order({ ...due, code: { coding: [{ system: 'urn:riverbend:orders', code: 'REF-GI-COLONOSCOPY' }] } }))).toBe(false);
  });
  it('is not met by an order that was not active at the start, or that the trial cancelled', () => {
    expect(ordered(order({ ...due, status: 'completed' }))).toBe(false);
    expect(ordered(order(due), order({ ...due, status: 'revoked' }))).toBe(false);
  });
});
