// The keyless tool catalogue and Try panel (plan phase P14): toolCatalog lists every tool with
// its description and schema; tryReadTool runs one read tool on a scratch store built from the
// world, returns its result, exposed_ids and the state hash before and after, and throws on a
// write tool name before it reads the world, so no store is built.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '../../../scripts/test/helpers.ts';
import { toolCatalog, tryReadTool } from '../try-tool.ts';

const bytes = new Uint8Array(readFileSync(join(repoRoot, 'fixtures/world.ndjson.gz')));
const manifestHash = (JSON.parse(readFileSync(join(repoRoot, 'fixtures/manifest.json'), 'utf8')) as { world: { state_hash: string } }).world.state_hash;

function counted() {
  let reads = 0;
  return { source: { read: async () => (reads++, bytes) }, reads: () => reads };
}

describe('toolCatalog', () => {
  it('lists every tool with a description and an object schema, read tools marked', () => {
    const tools = toolCatalog();
    const names = tools.map((t) => t.name);
    expect(names).toContain('fhir_search');
    expect(names).toContain('order_medication');
    expect(new Set(names).size).toBe(names.length);
    for (const t of tools) {
      expect(t.description.length, t.name).toBeGreaterThan(10);
      expect(t.inputSchema.type, t.name).toBe('object');
    }
    expect(tools.find((t) => t.name === 'fhir_search')?.kind).toBe('read');
    expect(tools.find((t) => t.name === 'order_medication')?.kind).toBe('write');
    expect(tools.find((t) => t.name === 'finish')?.kind).toBe('write');
  });
});

describe('tryReadTool', () => {
  it('runs fhir_search on a scratch store: rows, exposed_ids and an unchanged hash equal to the manifest', async () => {
    const w = counted();
    const r = await tryReadTool('fhir_search', { resource_type: 'Patient', count: 3 }, w.source);
    expect(r.result.is_error).toBe(false);
    expect((r.result.content as { entries: unknown[] }).entries.length).toBe(3);
    expect(r.result.exposed_ids.length).toBeGreaterThan(0);
    expect(r.result.exposed_ids.every((id) => id.startsWith('Patient/'))).toBe(true);
    expect(r.hash_before).toBe(manifestHash);
    expect(r.hash_after).toBe(r.hash_before);
    expect(w.reads()).toBe(1);
  });

  it('returns a tool error as a result, not a throw', async () => {
    const r = await tryReadTool('fhir_search', { resource_type: 'Nope' }, counted().source);
    expect(r.result.is_error).toBe(true);
    expect(r.hash_after).toBe(r.hash_before);
  });

  it('throws on order_medication and on an unknown name, and builds no store', async () => {
    const w = counted();
    await expect(tryReadTool('order_medication', {}, w.source)).rejects.toThrow(/order_medication is a write tool/);
    await expect(tryReadTool('finish', {}, w.source)).rejects.toThrow(/write tool/);
    await expect(tryReadTool('no_such_tool', {}, w.source)).rejects.toThrow(/no tool no_such_tool/);
    expect(w.reads()).toBe(0);
  });
});
