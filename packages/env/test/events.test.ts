// Mid-trial events (plan-amendment-w4 "Event mechanism", PW4-E1 stage 1): an active EventSpec
// fires from the one post-call hook in callTool, as a pure function of the specs and the calls so
// far. Its resources and one inbox Task enter the store stamped by clock.arrivalStamp, strictly
// between the trigger write's stamp and the next write's; they never take a write sequence
// number, so the agent's -t<n> ids stay gap-free, and they never appear in any call's
// written_ids (C2, C3). No tool result mentions them: the agent finds them in list_inbox and the
// chart. finish answers CONFLICT only when an event fired in the same model turn.
import { readFileSync } from 'node:fs';
import type { Bundle, DocumentReference, Observation, Resource } from '@medplum/fhirtypes';
import { beforeAll, describe, expect, it } from 'vitest';
import { clock, NOW_MS } from '../clock.ts';
import { activeSpecs, ARRIVAL_SUMMARY, FINISH_GUARD_MESSAGE, type EventSpec } from '../events.ts';
import { parseNdjson } from '../fixture-source.ts';
import { stateHash } from '../hash.ts';
import { Store } from '../store.ts';
import { callTool, type ToolResult } from '../tools/registry.ts';
import { newSession, TOOLS, USER, type WriteContext } from '../tools/write/index.ts';
import { indexDefinitions } from '../validate.ts';

const root = new URL('../../../', import.meta.url);
const base = await parseNdjson(readFileSync(new URL('fixtures/world.ndjson.gz', root)));
beforeAll(() => indexDefinitions(JSON.parse(readFileSync(new URL('fixtures/definitions-pruned.json', root), 'utf8')) as Bundle));

const fresh = (events: readonly EventSpec[] = []): WriteContext => ({ world: new Store(base), clock, policies: [], catalog: [], session: newSession(), events });
const ok = (r: ToolResult): Record<string, unknown> => {
  if (r.is_error) throw new Error(`expected success, got ${JSON.stringify(r.content)}`);
  return r.content as Record<string, unknown>;
};
const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

const OUTSIDE_TEXT = 'Outside facility report. Serum creatinine 2.4 mg/dL drawn at Lakeside Clinic.';
const creatinine: Observation = {
  resourceType: 'Observation',
  id: 'obs-evt-test-1',
  status: 'final',
  category: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'laboratory' }] }],
  code: { coding: [{ system: 'http://loinc.org', code: '2160-0', display: 'Creatinine [Mass/volume] in Serum or Plasma' }] },
  subject: { reference: 'Patient/pt-0001' },
  effectiveDateTime: '2026-10-23T07:30:00-04:00',
  valueQuantity: { value: 2.4, unit: 'mg/dL', system: 'http://unitsofmeasure.org', code: 'mg/dL' },
};
const outside: DocumentReference = {
  resourceType: 'DocumentReference',
  id: 'doc-evt-test-1',
  status: 'current',
  type: { text: 'Outside report' },
  subject: { reference: 'Patient/pt-0001' },
  content: [{ attachment: { contentType: 'text/plain', data: b64(OUTSIDE_TEXT) } }],
};

const afterWrite: EventSpec = {
  id: 'evt-a', item: 'item-1', class: 'A', trigger: { kind: 'after_write', patient: 'pt-0001' },
  resources: [creatinine], stampFields: ['Observation/obs-evt-test-1.issued'],
};
const afterSeen: EventSpec = {
  id: 'evt-o', item: 'item-2', class: 'O', trigger: { kind: 'after_exposed', ids: ['Patient/pt-0002'] },
  resources: [outside], stampFields: ['DocumentReference/doc-evt-test-1.date'],
};

const note = (patient: string, title: string) => ({ patient, type: 'progress_note', title, text: `Reviewed the chart of ${patient}.`, cites: [`Patient/${patient}`] });
const call = (ctx: WriteContext, name: string, input: unknown, turn = 1) => {
  ctx.session.turn = turn;
  return callTool(TOOLS, name, input, ctx);
};

describe('clock.arrivalStamp', () => {
  it('lies strictly between the trigger write and the next write, in arrival order', () => {
    for (const w of [0, 1, 7]) {
      const lo = Date.parse(w === 0 ? clock.now : clock.stamp(w));
      const hi = Date.parse(clock.stamp(w + 1));
      const a1 = Date.parse(clock.arrivalStamp(w, 1));
      const a2 = Date.parse(clock.arrivalStamp(w, 2));
      expect(lo < a1 && a1 < a2 && a2 < hi).toBe(true);
    }
    expect(clock.arrivalStamp(3, 5)).toBe('2026-10-23T08:00:03.005-04:00');
    expect(Date.parse(clock.arrivalStamp(0, 1))).toBe(NOW_MS + 1);
  });

  it('refuses a sequence that would reach the next write', () => {
    expect(() => clock.arrivalStamp(1, 0)).toThrow();
    expect(() => clock.arrivalStamp(1, 1000)).toThrow();
    expect(() => clock.arrivalStamp(-1, 1)).toThrow();
  });
});

describe('activeSpecs', () => {
  it('returns the ACTIVE specs in SPECS order; an inactive spec is left out', () => {
    expect(activeSpecs({ SPECS: [afterWrite, afterSeen], ACTIVE: ['evt-o'] }).map((s) => s.id)).toEqual(['evt-o']);
    expect(activeSpecs({ SPECS: [afterWrite, afterSeen], ACTIVE: [] })).toEqual([]);
  });

  it('refuses an ACTIVE id with no spec, a duplicate spec id, and a stamp field naming no resource', () => {
    expect(() => activeSpecs({ SPECS: [afterWrite], ACTIVE: ['evt-x'] })).toThrow(/evt-x/);
    expect(() => activeSpecs({ SPECS: [afterWrite, afterWrite], ACTIVE: [] })).toThrow(/duplicate/);
    expect(() => activeSpecs({ SPECS: [{ ...afterWrite, stampFields: ['Observation/nope.issued'] }], ACTIVE: ['evt-a'] })).toThrow(/nope/);
  });
});

describe('firing', () => {
  it('with no specs, a trial changes nothing it did not write', async () => {
    const [a, b] = [fresh(), fresh()];
    delete (b as { events?: unknown }).events;
    for (const ctx of [a, b]) {
      ok(call(ctx, 'fhir_read', { resource_type: 'Patient', id: 'pt-0001' }));
      ok(call(ctx, 'write_note', note('pt-0001', 'One')));
    }
    expect(a.session.fired).toEqual([]);
    expect(await stateHash((a.world as Store).resources())).toBe(await stateHash((b.world as Store).resources()));
  });

  it('after_write fires after the first committed write on that patient, not on a read or another patient', () => {
    const ctx = fresh([afterWrite]);
    ok(call(ctx, 'fhir_read', { resource_type: 'Patient', id: 'pt-0001' }));
    ok(call(ctx, 'write_note', note('pt-0002', 'Other patient')));
    expect(ctx.session.fired).toEqual([]);
    const r = call(ctx, 'write_note', note('pt-0001', 'Trigger'), 2);
    ok(r);
    expect(ctx.session.fired).toEqual([
      { spec: 'evt-a', turn: 2, arrival_seq: 1, stamp: clock.arrivalStamp(2, 1), keys: ['Observation/obs-evt-test-1', 'Task/inbox-a0001'] },
    ]);
    // C3: the arrival is not part of what the call wrote, and the result says nothing of it.
    expect(r.written_ids!.some((k) => k.includes('evt') || k.includes('inbox-a'))).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/evt|inbox-a/);
    // Fires once.
    ok(call(ctx, 'write_note', note('pt-0001', 'Again'), 3));
    expect(ctx.session.fired).toHaveLength(1);
    const obs = ctx.world.get<Observation>('Observation', 'obs-evt-test-1')!;
    expect(obs.issued).toBe(clock.arrivalStamp(2, 1));
    const lo = Date.parse(clock.stamp(2));
    expect(lo < Date.parse(obs.issued!) && Date.parse(obs.issued!) < Date.parse(clock.stamp(3))).toBe(true);
  });

  it('keeps the agent ids gap-free: the write after an arrival is -t<n+1>', () => {
    const ctx = fresh([afterWrite]);
    const first = ok(call(ctx, 'write_note', note('pt-0001', 'First')));
    const second = call(ctx, 'write_note', note('pt-0001', 'Second'));
    expect(JSON.stringify(first)).toContain('-t0001');
    expect(second.written_ids).toEqual(expect.arrayContaining(['Provenance/prov-t0002']));
    expect(ctx.session.writeSeq).toBe(2);
    expect(ctx.session.arrivalSeq).toBe(1);
  });

  it('after_exposed fires on the read that first shows every listed id', () => {
    const ctx = fresh([afterSeen]);
    ok(call(ctx, 'fhir_read', { resource_type: 'Patient', id: 'pt-0001' }));
    expect(ctx.session.fired).toEqual([]);
    ok(call(ctx, 'fhir_read', { resource_type: 'Patient', id: 'pt-0002' }));
    expect(ctx.session.fired.map((f) => [f.spec, f.stamp])).toEqual([['evt-o', clock.arrivalStamp(0, 1)]]);
  });

  it('a failed call fires nothing', () => {
    const ctx = fresh([afterSeen]);
    expect(call(ctx, 'fhir_read', { resource_type: 'Patient', id: 'pt-9999' }).is_error).toBe(true);
    expect(ctx.session.fired).toEqual([]);
  });

  it('an arrival the store would refuse is the environment fault: callTool throws', () => {
    const bad: EventSpec = { ...afterSeen, resources: [{ ...outside, status: 'not-a-status' } as unknown as Resource] };
    const ctx = fresh([bad]);
    expect(() => call(ctx, 'fhir_read', { resource_type: 'Patient', id: 'pt-0002' })).toThrow(/evt-o/);
  });

  it('the same tool log twice gives the same arrivals, stamps, ids and state hash', async () => {
    const runOnce = async () => {
      const ctx = fresh([afterWrite, afterSeen]);
      call(ctx, 'fhir_read', { resource_type: 'Patient', id: 'pt-0002' }, 1);
      call(ctx, 'write_note', note('pt-0001', 'One'), 2);
      call(ctx, 'write_note', note('pt-0001', 'Two'), 3);
      return { fired: ctx.session.fired, hash: await stateHash((ctx.world as Store).resources()) };
    };
    expect(await runOnce()).toEqual(await runOnce());
  });
});

describe('visibility', () => {
  it('a fired DocumentReference is found by search_notes and its Task by list_inbox, listed last', () => {
    const ctx = fresh([afterSeen]);
    const before = ok(call(ctx, 'search_notes', { query: 'Lakeside creatinine', patient: 'pt-0001' }));
    expect(JSON.stringify(before)).not.toContain('doc-evt-test-1');
    ok(call(ctx, 'fhir_read', { resource_type: 'Patient', id: 'pt-0002' }));
    const found = ok(call(ctx, 'search_notes', { query: 'Lakeside creatinine', patient: 'pt-0001' }));
    expect(JSON.stringify(found)).toContain('DocumentReference/doc-evt-test-1');
    const inbox = ok(call(ctx, 'list_inbox', { queue: 'results', count: 50 })) as { entries: Array<Record<string, unknown>> };
    const last = inbox.entries.at(-1)!;
    expect(last).toMatchObject({
      task: 'Task/inbox-a0001', focus: 'DocumentReference/doc-evt-test-1', patient: 'Patient/pt-0001',
      received: clock.arrivalStamp(0, 1), summary: ARRIVAL_SUMMARY.DocumentReference, status: 'requested', owner: USER,
    });
    // R29: the summary holds no deciding atom.
    expect(ARRIVAL_SUMMARY.DocumentReference).not.toMatch(/creatinine|2\.4/i);
  });

  it('a new result and a message go to their queues with generic summaries', () => {
    expect(ARRIVAL_SUMMARY).toEqual({
      Observation: 'New result', DiagnosticReport: 'New result', DocumentReference: 'Outside document received', Communication: 'New message',
    });
  });
});

describe('finish guard', () => {
  it('answers CONFLICT when an event fired in the same turn, and only then', () => {
    const ctx = fresh([afterWrite]);
    ok(call(ctx, 'write_note', note('pt-0001', 'Trigger'), 2));
    const guarded = call(ctx, 'finish', { summary: 'All done.' }, 2);
    expect(guarded).toMatchObject({ is_error: true, content: { error: { code: 'CONFLICT', message: FINISH_GUARD_MESSAGE } } });
    expect(FINISH_GUARD_MESSAGE).toBe('new items arrived in your queues during this turn; review them before finishing');
    expect(ctx.session.summary).toBeUndefined();
    ok(call(ctx, 'finish', { summary: 'All done.' }, 3));
    expect(ctx.session.summary).toBe('All done.');
  });

  it('never answers CONFLICT without a fire', () => {
    const ctx = fresh([afterWrite]);
    ok(call(ctx, 'write_note', note('pt-0002', 'No trigger'), 2));
    ok(call(ctx, 'finish', { summary: 'All done.' }, 2));
  });
});
