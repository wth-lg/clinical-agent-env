// An attachment's data as text (verifier P17i W0-1b r2 F5): base64 (or base64url) that decodes to
// UTF-8, whatever the content type says. The read tools show such data as text and strip it from
// fhir_search rows (packages/env/tools/read/notes.ts), and the overlay key check
// (packages/env/overlay.ts) decodes the same data, so what the agent can read is what the check read.
const utf8 = new TextDecoder('utf-8', { fatal: true });

// The bytes base64 or base64url data holds, one character per byte (a Latin-1 reading), or null when
// it is not base64.
export function dataBytes(data: unknown): string | null {
  if (typeof data !== 'string') return null;
  try {
    return atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
}

export function dataText(data: unknown): string | null {
  const bytes = dataBytes(data);
  if (bytes === null) return null;
  try {
    return utf8.decode(Uint8Array.from(bytes, (c) => c.charCodeAt(0)));
  } catch {
    return null;
  }
}

// Whether a content type says text (text/plain, Text/HTML; charset=...).
export const textType = (contentType: unknown): boolean => typeof contentType === 'string' && contentType.trim().toLowerCase().startsWith('text/');
