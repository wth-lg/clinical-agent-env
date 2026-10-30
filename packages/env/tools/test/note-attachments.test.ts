// verifier P17i W0-1b r2 F5: the read tools treat an attachment as text when its data is base64 of
// UTF-8 text, whatever its content type says, so no such data reaches the agent as raw base64 and
// the overlay key check (packages/env/overlay.ts) decodes exactly what the agent can read.
import type { DocumentReference } from '@medplum/fhirtypes';
import { describe, expect, it } from 'vitest';
import { noteText, withoutNoteData } from '../read/notes.ts';

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
const doc = (attachment: Record<string, unknown>): DocumentReference =>
  ({ resourceType: 'DocumentReference', id: 'doc-00001', status: 'current', subject: { reference: 'Patient/pt-0001' }, content: [{ attachment }] }) as DocumentReference;

describe('note attachments by their data, not their content type', () => {
  for (const contentType of [undefined, null, '', ' text/plain', 'Text/Plain', 'application/pdf', 'application/octet-stream']) {
    it(`reads and strips text data with content type ${JSON.stringify(contentType)}`, () => {
      const r = doc({ ...(contentType === undefined ? {} : { contentType }), data: b64('Seen today; plan unchanged.') });
      expect(noteText(r)).toBe('Seen today; plan unchanged.');
      const shown = withoutNoteData(r, true) as DocumentReference;
      expect(shown.content[0]!.attachment).not.toHaveProperty('data');
      expect(shown.content[0]!.attachment).toMatchObject({ size: 27, read_with: 'fhir_read' });
    });
  }

  it('leaves data that is not UTF-8 text as stored', () => {
    const r = doc({ contentType: 'application/pdf', data: btoa(String.fromCharCode(0xff, 0xfe, 0x00, 0x81)) });
    expect(noteText(r)).toBeUndefined();
    expect(withoutNoteData(r, true)).toBe(r);
  });
});
