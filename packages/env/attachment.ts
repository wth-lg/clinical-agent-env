// An attachment's data as text (verifier P17i W0-1b r2 F5): base64 (or base64url) that decodes to
// UTF-8 with no NUL in it, whatever the content type says (UTF-16 text decodes as UTF-8 with a NUL
// between the letters, verifier P17i W0-1c V4). The read tools show such data as text and strip it from
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
    const text = utf8.decode(Uint8Array.from(bytes, (c) => c.charCodeAt(0)));
    return text.includes('\0') ? null : text;
  } catch {
    return null;
  }
}

// Whether a content type says text (text/plain, Text/HTML; charset=...).
export const textType = (contentType: unknown): boolean => typeof contentType === 'string' && contentType.trim().toLowerCase().startsWith('text/');

// Why an attachment's data cannot be filed as text, or null: data under a text/* type, or under none,
// that is not base64 of UTF-8 text free of NUL (verifier P17i W0-1c V4). fixtures:build refuses such
// data (packages/env/overlay.ts), so no read finds text it cannot show.
export function textDefect(attachment: { contentType?: unknown; data?: unknown }): string | null {
  const { contentType, data } = attachment;
  if (typeof data !== 'string' || !(contentType === undefined || contentType === null || textType(contentType))) return null;
  const bytes = dataBytes(data);
  if (bytes === null) return 'is not base64';
  if (bytes.includes('\0')) return 'holds a NUL byte (UTF-16 or binary data)';
  return dataText(data) === null ? 'is not UTF-8 text' : null;
}
