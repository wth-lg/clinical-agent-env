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

  // verifier P17i W0-1b r3 F3: text/* data that is not UTF-8 is a fixture defect. noteText throws, so
  // the read tool's caller records INTERNAL, and no read shows the raw base64.
  it('throws on text/* data that is not UTF-8, and never shows it raw', () => {
    for (const contentType of ['text/plain', ' Text/Plain; charset=iso-8859-1', 'text/html']) {
      const r = doc({ contentType, data: btoa(String.fromCharCode(...new TextEncoder().encode('see '), 0xe9, 0x20, 0x31)) });
      expect(() => noteText(r), contentType).toThrow(/not UTF-8/);
      expect((withoutNoteData(r, true) as DocumentReference).content[0]!.attachment, contentType).not.toHaveProperty('data');
    }
  });

  // verifier P17i W0-1c V4: UTF-16 text decodes as UTF-8 with a NUL between the letters, so a NUL
  // makes data not text: under a text/* type it throws, as other non-UTF-8 text does, and it is
  // never shown raw or as text with NULs in it.
  it('treats data holding a NUL as not text', () => {
    for (const contentType of ['text/plain', 'text/plain; charset=utf-16le', 'Text/HTML']) {
      const r = doc({ contentType, data: Buffer.from('see the creatinine', 'utf16le').toString('base64') });
      expect(() => noteText(r), contentType).toThrow(/not UTF-8/);
      expect((withoutNoteData(r, true) as DocumentReference).content[0]!.attachment, contentType).not.toHaveProperty('data');
    }
    const untyped = doc({ data: Buffer.from('see the creatinine', 'utf16le').toString('base64') });
    expect(noteText(untyped)).toBeUndefined();
    expect(() => noteText(doc({ contentType: 'text/plain', data: b64('a\u0000b') }))).toThrow(/not UTF-8/);
  });

  it('leaves data that is not UTF-8 text as stored', () => {
    const r = doc({ contentType: 'application/pdf', data: btoa(String.fromCharCode(0xff, 0xfe, 0x00, 0x81)) });
    expect(noteText(r)).toBeUndefined();
    expect(withoutNoteData(r, true)).toBe(r);
  });
});
