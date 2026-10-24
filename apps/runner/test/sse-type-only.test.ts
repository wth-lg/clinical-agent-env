// P11f (9): the runner reduces each upstream SSE error event to its type (sseTypeOnly) per parsed
// frame, not per line, so an error event whose data spans several data: lines, or whose frame
// arrives in two chunks, is typed once and its upstream text never reaches the client.
import { describe, expect, it } from 'vitest';
import { sseTypeOnly } from '../server.ts';

const SECRET = 'upstream-text-with-sk-ant-secret';
async function through(chunks: string[]): Promise<string> {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const x of chunks) c.enqueue(enc.encode(x));
      c.close();
    },
  });
  return new Response(sseTypeOnly(body)).text();
}
const TYPED = 'data: {"type":"error","error":{"type":"overloaded_error"}}';

describe('sseTypeOnly, per SSE frame', () => {
  it('an error event whose data spans two data: lines, split across two chunks, is typed once', async () => {
    const out = await through(['event: error\ndata: {"type":"error",\n', `data: "error":{"type":"overloaded_error","message":"${SECRET}"}}\n\n`]);
    expect(out).not.toContain(SECRET);
    expect(out).toBe(`event: error\n${TYPED}\n\n`);
  });

  it('a one-line error event split mid-line is typed once', async () => {
    const frame = `event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"${SECRET}"}}\n\n`;
    for (let at = 1; at < frame.length; at += 7) {
      const out = await through([frame.slice(0, at), frame.slice(at)]);
      expect(out, `split at ${at}`).toBe(`event: error\n${TYPED}\n\n`);
    }
  });

  it('CRLF line endings are frames too', async () => {
    const out = await through([`event: error\r\ndata: {"type":"error",\r\n`, `data: "error":{"type":"overloaded_error","message":"${SECRET}"}}\r\n\r\n`]);
    expect(out).not.toContain(SECRET);
    expect(out).toContain(TYPED);
  });

  it('every other frame passes through byte for byte, in order', async () => {
    const frames = 'event: message_start\ndata: {"type":"message_start","message":{"error":"not an error event"}}\n\nevent: ping\ndata: {"type":"ping"}\n\n: comment\n\n';
    expect(await through([frames.slice(0, 30), frames.slice(30)])).toBe(frames);
  });
});
