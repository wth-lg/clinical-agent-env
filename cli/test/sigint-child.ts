// Child process for cli/test/run-one-interrupt.test.ts: `node cli/test/sigint-child.ts <marker> <run-one args...>`
// runs cli/run-one.ts through withInterrupt, the SIGINT wiring of `pnpm cli run-one`, with the toy
// scenario, except that the second request writes <marker> and answers only by failing when its
// signal aborts, as fetch does. The parent sends SIGINT once the marker exists.
import { writeFileSync } from 'node:fs';
import { scenarioTransport } from '../../apps/web/src/harness/scenarios.ts';
import { withInterrupt } from '../run-one.ts';

const [marker, ...args] = process.argv.slice(2);
let n = 0;
process.exitCode = await withInterrupt(args, {
  env: process.env,
  out: (l) => process.stdout.write(`${l}\n`),
  fetch: () => Promise.reject(new Error('sigint-child makes no live call')),
  mock: (name) => {
    const toy = scenarioTransport(name).transport;
    return async (request) => {
      if (++n !== 2) return toy(request);
      writeFileSync(marker as string, 'waiting');
      return new Promise<Response>((_resolve, reject) => {
        const keepAlive = setInterval(() => {}, 1000);
        request.signal.addEventListener('abort', () => {
          clearInterval(keepAlive);
          reject(request.signal.reason ?? new DOMException('aborted', 'AbortError'));
        });
      });
    };
  },
});
