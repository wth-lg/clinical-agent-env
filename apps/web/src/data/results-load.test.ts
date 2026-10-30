// The results load (apps/web/src/data/results.ts) with a mocked fetch: one pilot's unreadable
// audit.jsonl is a warning on that run, not an error for every run, and the load settles only
// after every fetch it started has settled, so ViewBody's data-preload="settled" (which the
// key-gate e2e test waits for) never fires while a preload read is still in flight.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { repoRoot } from '../../../../scripts/test/helpers.ts';
import type { loadResults as LoadResults } from './results.ts';

const RECORD = readFileSync(join(repoRoot, 'apps/web/e2e/fixtures/sample-results/results/runs/sample-1/trials/renal-dose-review/0.json'), 'utf8');
const FILES = ['results/pilot-a/audit.jsonl', 'results/pilot-a/trials/t/0.json', 'results/pilot-b/trials/t/0.json', 'results/pilot-b/trials/t/1.json'];

// Serves FILES under data/: pilot-a's audit.jsonl answers 500, pilot-b's records after 200 ms.
// Counts the fetches that have started and not yet settled.
function stubFetch(): { pending: () => number } {
  let pending = 0;
  vi.stubGlobal('fetch', async (url: string) => {
    const rel = String(url).replace(/^.*\/data\//, '');
    pending++;
    try {
      if (rel === 'index.json') return new Response(JSON.stringify({ files: FILES }));
      if (rel === 'results/pilot-a/audit.jsonl') return new Response('', { status: 500 });
      if (rel.startsWith('results/pilot-b/')) await new Promise((r) => setTimeout(r, 200));
      return new Response(RECORD);
    } finally {
      pending--;
    }
  });
  return { pending: () => pending };
}

// A fresh module each time: results.ts caches the load.
const freshLoad = async (): Promise<typeof LoadResults> => (await import('./results.ts')).loadResults;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('./world.ts');
  vi.resetModules();
});

describe('loadResults with one pilot audit.jsonl unreadable and another pilot slow', () => {
  it("loads every run: pilot-a's audit is a warning, pilot-b's records all load", async () => {
    stubFetch();
    const r = await (await freshLoad())();
    expect(r.kind).toBe('ready');
    if (r.kind !== 'ready') return;
    const [a, b] = r.pilots;
    expect(r.pilots.map((p) => p.dir)).toEqual(['results/pilot-a', 'results/pilot-b']);
    expect(a!.warnings).toEqual(['audit.jsonl cannot be read: data/results/pilot-a/audit.jsonl: HTTP 500']);
    expect(a!.trials).toHaveLength(1);
    expect(b!.trials).toHaveLength(2);
    expect(b!.bad).toEqual([]);
  });

  it('has no fetch pending when Promise.allSettled([loadResults()]) resolves', async () => {
    const { pending } = stubFetch();
    const loadResults = await freshLoad();
    await Promise.allSettled([loadResults()]);
    expect(pending()).toBe(0);
  });

  it('when a run fails to load, reports that error only after every other run has settled', async () => {
    // A manifest with no world makes each run's grading throw once its records are in: pilot-a's
    // first, while pilot-b's records are still in flight.
    vi.doMock('./world.ts', () => ({ MANIFEST: {} }));
    const { pending } = stubFetch();
    const loadResults = await freshLoad();
    const [r] = await Promise.allSettled([loadResults()]);
    expect(pending()).toBe(0);
    expect(r).toMatchObject({ status: 'fulfilled', value: { kind: 'error' } });
  });
});
