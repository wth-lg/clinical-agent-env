// P17i B2 (R14-08, R14-09, R14-10, R14-11, R14-44): tool texts and behaviour, run through the
// real task envs (catalog, overlays) by the matrix's scripted trial. lookup_catalog matches
// tokens, not substrings, so "5" no longer finds the 2.5 mg row; record_allergy defaults a
// catalog medication's category, SNOMED codes included; fhir_read takes 'Type/id'; and the
// descriptions say what fhir_search's MedicationRequest date reads, which filters each type
// supports, and what a staff message lists in about.
import { describe, expect, it } from 'vitest';
import { loadMatrixTask, matrixEnv } from '../../../../cli/matrix.ts';
import type { TrialEvent } from '../../../core/events.ts';
import { trial } from '../../../grader/matrix/matrix.ts';
import type { ScriptCall } from '../../../grader/matrix/types.ts';
import { clock } from '../../clock.ts';
import { Store } from '../../store.ts';
import { READ_TOOLS, type CatalogEntry } from '../read/index.ts';
import { callTool, definitions } from '../registry.ts';
import { TOOLS } from '../write/index.ts';

type Result = Extract<TrialEvent, { type: 'tool_result' }>;
const env = matrixEnv();

// Each call's tool_result, in order, from one scripted turn in the task's env.
async function results(taskId: string, calls: ScriptCall[]): Promise<Result[]> {
  const task = await loadMatrixTask(taskId);
  const run = await trial(env, task, { kind: 'alternative', id: 'b2_probe', script: [{ calls }] });
  return run.events.filter((e): e is Result => e.type === 'tool_result');
}
const lookup = (query: string) => ({ name: 'lookup_catalog', input: { query, kind: 'medication' } });
const displays = (r: Result) => (r.content as { entries: Array<{ display: string; code: string }> }).entries.map((e) => e.display);
const describeTool = (name: string) => definitions(TOOLS).find((t) => t.name === name)!;

describe('lookup_catalog matches tokens (R14-09)', () => {
  it('on renal-dose-review: a number matches only an equal number, a word or a trailing-dot number a prefix', async () => {
    const queries = ['apixaban 5', 'apixaban 2', 'apixaban 2.', 'apixaban 2.5', 'apix', '1364445', 'apixaban-5', 'apixaban/5', 'apixaban,5', '--'];
    const r = await results('renal-dose-review', queries.map(lookup));
    const by = Object.fromEntries(queries.map((q, i) => [q, r[i]!]));
    expect(displays(by['apixaban 5']!)).toEqual(['apixaban 5 MG Oral Tablet']);
    expect(displays(by['apixaban 2']!)).not.toContain('apixaban 2.5 MG Oral Tablet');
    expect(displays(by['apixaban 2.']!)).toEqual(['apixaban 2.5 MG Oral Tablet']);
    expect(displays(by['apixaban 2.5']!)).toEqual(['apixaban 2.5 MG Oral Tablet']);
    expect(displays(by['apix']!)).toEqual(['apixaban 2.5 MG Oral Tablet', 'apixaban 5 MG Oral Tablet']);
    expect((by['1364445']!.content as { entries: Array<{ code: string }> }).entries.map((e) => e.code)).toEqual(['1364445']);
    for (const q of ['apixaban-5', 'apixaban/5', 'apixaban,5']) expect(displays(by[q]!), q).toEqual(displays(by['apixaban 5']!));
    expect(by['--']).toMatchObject({ is_error: true, error_code: 'INVALID_INPUT' });
    expect(JSON.stringify(by['--']!.content)).toContain("'query' must contain at least one letter or digit");
  });

  it('a code splits into word tokens that match its own tokens', async () => {
    const [r] = await results('contrast-ct-prep', [{ name: 'lookup_catalog', input: { query: 'IMG-CT', kind: 'imaging' } }]);
    expect(displays(r!).length).toBeGreaterThan(0);
  });

  it('states the token rule', () => {
    const d = describeTool('lookup_catalog').description;
    expect(d).toContain('split into tokens at every character that is not a letter or digit');
    expect(d).toContain('a number token matches only an equal number');
  });
});

describe('record_allergy defaults a catalog medication to category medication (R14-10)', () => {
  it('on message-queue: SNOMED 764146007 from the catalog commits with category medication', async () => {
    const [r] = await results('message-queue', [{ name: 'record_allergy', input: { patient: 'pt-0026', substance_code: '764146007', criticality: 'high', verification: 'confirmed' } }]);
    expect(JSON.stringify(r!.content)).not.toContain("'category' is required");
    expect(r).toMatchObject({ is_error: false });
    expect(r!.written_ids?.some((id) => id.startsWith('AllergyIntolerance/'))).toBe(true);
  });
});

describe('fhir_read takes Type/id (R14-44)', () => {
  it("a matching type reads the same resource; another type names both", async () => {
    const [plain, prefixed, other] = await results('message-queue', [
      { name: 'fhir_read', input: { resource_type: 'Patient', id: 'pt-0026' } },
      { name: 'fhir_read', input: { resource_type: 'Patient', id: 'Patient/pt-0026' } },
      { name: 'fhir_read', input: { resource_type: 'Observation', id: 'Patient/pt-0026' } },
    ]);
    expect(prefixed!.is_error).toBe(false);
    expect(prefixed!.content).toEqual(plain!.content);
    expect(other).toMatchObject({ is_error: true, error_code: 'INVALID_INPUT' });
    expect(JSON.stringify(other!.content)).toMatch(/Patient.*Observation|Observation.*Patient/);
  });
});

describe('descriptions (R14-08, R14-11, R14-44)', () => {
  it('fhir_search says what MedicationRequest date reads and how to find recent orders', () => {
    const d = describeTool('fhir_search').description;
    expect(d).toContain('dosageInstruction.timing.event');
    expect(d).toContain('authoredOn');
  });

  it('fhir_search lists the filters each type supports', () => {
    const d = describeTool('fhir_search').description;
    expect(d).toContain('MedicationRequest: patient, code, category, status, date_ge, date_le, sort');
    expect(d).toContain('Provenance: patient');
  });

  it('send_message says a staff message about a patient lists the patient or result in about', () => {
    expect(describeTool('send_message').description).toContain('A message to staff about a patient lists the patient, or the result, in about.');
  });

  it('search_patients has no "maya ok" example', () => {
    expect(JSON.stringify(describeTool('search_patients'))).not.toContain('maya ok');
  });
});

describe('verifier B2-1 M1, M2', () => {
  const RX = 'http://www.nlm.nih.gov/research/umls/rxnorm';
  const catalog: CatalogEntry[] = [
    { kind: 'medication', code: '1', system: RX, display: 'drugx 2.5 MG Oral Tablet', strengths: ['2.5 mg'] },
    { kind: 'medication', code: '2', system: RX, display: 'drugx 5 MG Oral Tablet', strengths: ['5 mg'] },
    { kind: 'medication', code: '3', system: RX, display: 'drugy Oral Solution', strengths: ['.5 mg/mL'] },
  ];
  const find = (query: string) => {
    const r = callTool(READ_TOOLS, 'lookup_catalog', { query, kind: 'medication' }, { world: new Store([]), clock, policies: [], catalog });
    return (r.content as { entries: Array<{ code: string }> }).entries.map((e) => e.code);
  };

  it('M1: a leading . before digits is part of the number; a trailing . after a decimal is dropped', () => {
    expect(find('.5')).toEqual(['3']);
    expect(find('drugx 2.5.')).toEqual(['1']);
    expect(find('drugx 2.')).toEqual(['1']);
  });

  it('M2: the medication catalog holds RxNorm and SNOMED CT codes', () => {
    for (const name of ['lookup_catalog', 'record_allergy']) {
      const d = describeTool(name).description;
      expect(d, name).toContain('RxNorm or SNOMED CT');
      expect(d, name).not.toMatch(/RxNorm formulary|RxNorm drug code/);
    }
  });
});
