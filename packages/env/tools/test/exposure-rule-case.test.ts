// verifier-phase-snippet-2, after #33 (P11f (13)): the test oracle reads a text attachment's
// contentType without case, as notes.ts isText does, so a 'Text/Plain' note is text to it too.
import type { DocumentReference, Resource } from '@medplum/fhirtypes';
import { describe, expect, it } from 'vitest';
import { ruleViolations } from './exposure-rule.ts';

const NOTE = 'DocumentReference/doc-x';

describe('the oracle reads contentType without case (P11f (13))', () => {
  const text = 'Short note: K 5.9, recheck tomorrow.';
  const stored: DocumentReference = {
    resourceType: 'DocumentReference', id: 'doc-x', status: 'current',
    content: [{ attachment: { contentType: 'Text/Plain', data: btoa(text) } }],
  };
  const lookup = (key: string): Resource | undefined => (key === NOTE ? stored : undefined);

  it('a Text/Plain note shown whole but not exposed is under-tagging; exposed, it is fine', () => {
    const shown = { is_error: false, content: { results: [{ note: NOTE, snippet: text, whole: true }] }, shown: { [NOTE]: text } };
    expect(ruleViolations({ ...shown, exposed_ids: [], referenced_ids: [NOTE] }, lookup)).toContain(`${NOTE} shows its decisive fields but is not exposed`);
    expect(ruleViolations({ ...shown, exposed_ids: [NOTE], referenced_ids: [] }, lookup)).toEqual([]);
  });
});
