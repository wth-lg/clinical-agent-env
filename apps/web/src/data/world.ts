// The world every trial starts from, and its manifest. Both are bundled with the code, not with
// the results, so the Environment view and grader validation work in a build with no results/.
// The world is fetched from the same origin on first use and kept; definitions-pruned.json, which
// the write tools validate against, likewise.
import type { FixtureSource } from '../../../../packages/env/fixture-source.ts';
import manifest from '../../../../fixtures/manifest.json';
import definitionsUrl from '../../../../fixtures/definitions-pruned.json?url';
import worldUrl from '../../../../fixtures/world.ndjson.gz?url';

export const MANIFEST = manifest as { now: string; world: { state_hash: string; resources: number; by_type: Record<string, number> } };

let bytes: Promise<Uint8Array> | undefined;
let definitions: Promise<unknown> | undefined;

async function get(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

export function worldSource(): FixtureSource {
  return {
    read: () =>
      (bytes ??= get(worldUrl).then(async (r) => new Uint8Array(await r.arrayBuffer())).catch((e: unknown) => {
        bytes = undefined;
        throw e;
      })),
  };
}

export function worldDefinitions(): Promise<unknown> {
  return (definitions ??= get(definitionsUrl).then((r) => r.json() as Promise<unknown>).catch((e: unknown) => {
    definitions = undefined;
    throw e;
  }));
}
