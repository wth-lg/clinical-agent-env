// An attachment's data as text (verifier P17i W0-1b r2 F5): base64 that decodes to UTF-8, whatever
// the content type says. The read tools show such data as text and strip it from fhir_search rows
// (packages/env/tools/read/notes.ts), and the overlay key check (packages/env/overlay.ts) decodes
// the same data, so what the agent can read is what the check read.
const utf8 = new TextDecoder('utf-8', { fatal: true });

export function dataText(data: unknown): string | null {
  if (typeof data !== 'string') return null;
  try {
    return utf8.decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}
