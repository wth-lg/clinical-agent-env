// The trial Worker starts from a same-origin blob: URL so that the page's CSP binds it
// (src/live/transport/worker.ts). In each browser: the design CSP's worker-src lets a blob: module
// Worker start, and inside it the browser itself refuses a fetch and an import() from another
// origin, which a real server on 127.0.0.1 (the page is on localhost) would otherwise receive.
import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';

test('a blob: Worker starts and runs under the page CSP: other origins are refused', async ({ page }) => {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url ?? '');
    res.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'text/javascript' });
    res.end('export const reached = true;');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const foreign = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    await page.goto('./');
    const result = await page.evaluate(async (origin) => {
      const code = `
        const attempt = async (f) => { try { await f(); return 'reached'; } catch { return 'refused'; } };
        const self_ = await attempt(() => fetch(location.origin + '/clinical-agent-env/data/index.json'));
        postMessage({ fetch: await attempt(() => fetch('${origin}/fetch')), import: await attempt(() => import('${origin}/mod.js')), self: self_ });`;
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      return new Promise<unknown>((resolve) => {
        const w = new Worker(url, { type: 'module' });
        w.onmessage = (e) => resolve(e.data);
        w.onerror = () => resolve('did not start');
        setTimeout(() => resolve('timed out'), 10_000);
      });
    }, foreign);
    expect(result).toEqual({ fetch: 'refused', import: 'refused', self: 'reached' });
    expect(hits).toEqual([]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
