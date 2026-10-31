// The Environment Try panel prefills each read tool with a working example input (ui-polish 4.4):
// every read tool has one, and each runs on the committed world, with no task, as the panel runs
// it, and returns a result that is not a tool error.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '../../../scripts/test/helpers.ts';
import { toolCatalog, tryReadTool } from '../../../packages/core/try-tool.ts';
import { TRY_EXAMPLES } from '../src/environment/examples.ts';

const bytes = new Uint8Array(readFileSync(join(repoRoot, 'fixtures/world.ndjson.gz')));
const READ = toolCatalog().filter((t) => t.kind === 'read').map((t) => t.name);

describe('Try examples', () => {
  it('names every read tool and no other', () => {
    expect(Object.keys(TRY_EXAMPLES).sort()).toEqual([...READ].sort());
  });

  it.each(READ)('%s: the example runs with no tool error', async (name) => {
    const r = await tryReadTool(name, TRY_EXAMPLES[name], { read: async () => bytes });
    expect(r.result.is_error, JSON.stringify(r.result.content)).toBe(false);
  });

  it('search_patients finds Harold Vance', async () => {
    const r = await tryReadTool('search_patients', TRY_EXAMPLES.search_patients, { read: async () => bytes });
    expect(JSON.stringify(r.result.content)).toContain('Harold Vance');
  });
});
