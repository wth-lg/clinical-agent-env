// serve-local, the test server, survives a request it cannot turn into a Request (security review
// M4): an absolute-form target and the TRACE method each get 400, and the server keeps serving.
import { connect } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { serveLocal, type LocalRelay } from './serve-local.ts';

const PAGES = 'https://wth-lg.github.io';
let relay: LocalRelay | undefined;
afterEach(async () => {
  await relay?.close();
  relay = undefined;
});

// The status line of the answer to one raw request.
function raw(port: number, head: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => socket.write(head));
    let data = '';
    socket.on('data', (d) => {
      data += d.toString();
      if (data.includes('\r\n')) {
        socket.destroy();
        resolve(data.split('\r\n')[0]!);
      }
    });
    socket.on('error', reject);
    setTimeout(() => reject(new Error(`no answer: ${JSON.stringify(data)}`)), 3000);
  });
}

describe('serve-local', () => {
  it.each([
    ['an absolute-form target', (port: number) => `POST http://evil.example/v1/messages HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${PAGES}\r\nContent-Length: 2\r\n\r\n{}`],
    ['the TRACE method', (port: number) => `TRACE /v1/messages HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`],
  ])('answers %s with 400 and keeps serving', async (_name, head) => {
    relay = await serveLocal({ allowedOrigin: PAGES });
    expect(await raw(relay.port, head(relay.port))).toBe('HTTP/1.1 400 Bad Request');
    expect(await raw(relay.port, `GET /v1/messages HTTP/1.1\r\nHost: 127.0.0.1:${relay.port}\r\n\r\n`)).toBe('HTTP/1.1 405 Method Not Allowed');
    expect(relay.upstreamCalls).toHaveLength(0);
  });
});
