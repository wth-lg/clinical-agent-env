// The trial detail's ENV_ERROR Where (apps/web/src/trial/steps.ts internalErrorRow): the first tool
// call that failed with an internal error, at the step the grader numbers it, on the committed
// ENV_ERROR trajectory (its third tool call that ran failed, verifier-ui-copy-1 m4) and on that
// trajectory with the failure served as an ordinary result.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTrajectory } from '../../../packages/core/trajectory.ts';
import { repoRoot } from '../../../scripts/test/helpers.ts';
import { internalErrorRow, trajectoryOf, writtenWords } from '../src/trial/steps.ts';
import { whereSteps } from '../src/trial/where.ts';

const FILE = join(repoRoot, 'apps/web/e2e/fixtures/trial/results/runs/trial-1/trajectories/discharge-medrec/12.jsonl');
const text = readFileSync(FILE, 'utf8');

describe('internalErrorRow', () => {
  it('is null when no tool call failed with an internal error', () => {
    const ok = text.split('\n').filter((l) => l.trim() !== '').map((l) => {
      const e = JSON.parse(l) as { type: string; error_code?: string | null };
      return e.type === 'tool_result' && e.error_code === 'INTERNAL' ? JSON.stringify({ ...e, is_error: false, error_code: null }) : l;
    }).join('\n');
    expect(internalErrorRow(trajectoryOf(parseTrajectory(ok)).rows)).toBeNull();
  });

  it('finds the first tool call that failed with an internal error, at its step', () => {
    const row = internalErrorRow(trajectoryOf(parseTrajectory(text)).rows);
    // The T4 worklist oracle's third call is a patient search (W1 train, builder-249).
    expect(row).toMatchObject({ kind: 'tool', step: 3, error: 'INTERNAL', name: 'search_patients' });
  });
});

// PW4-E1: an env_event is a row of its own right after the tool call that fired it, with that step.
describe('arrival rows', () => {
  it('follow the call that fired them, naming the event and what arrived', () => {
    const at = (type: string, more: object) => JSON.stringify({ v: 2, seq: 0, ts: '2026-10-23T12:00:00.000Z', turn: 1, type, ...more });
    const lines = [
      at('tool_call', { tool_use_id: 'u1', name: 'fhir_read', input: { resource_type: 'Condition', id: 'cond-00002' } }),
      at('tool_result', { tool_use_id: 'u1', name: 'fhir_read', executed: true, is_error: false, error_code: null, content: {}, exposed_ids: ['Condition/cond-00002'], referenced_ids: [] }),
      at('env_event', { tool_use_id: 'u1', spec: 'toy-a1', arrival_seq: 1, stamp: '2026-10-23T08:00:00.001-04:00', keys: ['Observation/obs-toy-a1', 'Task/inbox-a0001'] }),
      at('tool_call', { tool_use_id: 'u2', name: 'fhir_read', input: { resource_type: 'Observation', id: 'obs-toy-a1' } }),
      at('tool_result', { tool_use_id: 'u2', name: 'fhir_read', executed: true, is_error: false, error_code: null, content: {}, exposed_ids: ['Observation/obs-toy-a1'], referenced_ids: [] }),
    ].map((l, i) => l.replace('"seq":0', `"seq":${i}`));
    const rows = trajectoryOf(parseTrajectory(`${lines.join('\n')}\n`)).rows;
    expect(rows.map((r) => [r.kind, r.step])).toEqual([['tool', 1], ['arrival', 1], ['tool', 2]]);
    expect(rows[1]).toMatchObject({ kind: 'arrival', spec: 'toy-a1', keys: ['Observation/obs-toy-a1', 'Task/inbox-a0001'] });
  });
});

// P25u S3 A11: the written ids in words, the Provenance entry last as "+ provenance", so the order
// or note id is never the part a narrow row cuts off.
describe('writtenWords', () => {
  it('puts the provenance after the records it covers', () => {
    expect(writtenWords(['Provenance/prov-t0001', 'ServiceRequest/sr-t0001'])).toBe('ServiceRequest/sr-t0001 + provenance');
    expect(writtenWords(['MedicationRequest/mr-61006', 'MedicationRequest/mr-t0001', 'Provenance/prov-t0001'])).toBe('MedicationRequest/mr-61006, MedicationRequest/mr-t0001 + provenance');
    expect(writtenWords(['DocumentReference/doc-t0002'])).toBe('DocumentReference/doc-t0002');
    expect(writtenWords(['Provenance/prov-t0009'])).toBe('Provenance/prov-t0009');
  });
});

// P25u S3 J4: the steps that explain a failure, for the header's Where and the Attribution tab: the
// arrival that put a decisive record in the queues, the step each decisive record was first shown
// at (or never), and the decisive step; in step order, with the never-shown records last; the
// decisive step alone when the record gives nothing else.
describe('whereSteps', () => {
  const exposure = [{ id: 'Observation/obs-07502', first_exposed_step: 75 }, { id: 'Observation/obs-07501', first_exposed_step: null }];
  const arrivals = [{ step: 52, keys: ['Observation/obs-07501', 'Observation/obs-07502', 'Task/inbox-a0001'] }, { step: 60, keys: ['DocumentReference/doc-02501', 'Task/inbox-a0003'] }];
  it('lists the arrival, the first showing, the record never shown, and the decisive step, in order', () => {
    expect(whereSteps({ decisiveStep: 104, exposure, arrivals })).toEqual([
      { step: 52, kind: 'arrival', text: 'Observation/obs-07501 and Observation/obs-07502 arrived in the queues' },
      { step: 75, kind: 'shown', text: 'Observation/obs-07502 was first shown to the model' },
      { step: 104, kind: 'decisive', text: 'the step the failed check points at' },
      { step: null, kind: 'never', text: 'Observation/obs-07501 was never shown to the model' },
    ]);
  });
  it('is the decisive step alone with no exposure and no arrival, and empty with neither', () => {
    expect(whereSteps({ decisiveStep: 64, exposure: [], arrivals: [] })).toEqual([{ step: 64, kind: 'decisive', text: 'the step the failed check points at' }]);
    expect(whereSteps({ decisiveStep: null, exposure: [], arrivals })).toEqual([]);
  });
  it('ignores an arrival that put no decisive record in the queues', () => {
    expect(whereSteps({ decisiveStep: null, exposure: [{ id: 'Observation/obs-01322', first_exposed_step: 80 }], arrivals }).map((w) => w.kind)).toEqual(['shown']);
  });
});
