// The keyless tool catalogue and Try panel (plan phase P14). The UI's Environment view lists the
// tools and runs a read tool through this module only, so apps/web/src never imports the tool
// registry (P15's lint rule). Pure: the world arrives as a FixtureSource, from a same-origin
// fetch in the browser or a file in a test.
//   toolCatalog()                  every tool the model can be offered: name, description,
//                                  input schema, and whether it reads or writes
//   tryReadTool(name, args, world) builds a fresh scratch store from the world, runs one read
//                                  tool through callTool (the loop's validation and exposure
//                                  tags), and returns the result, its exposed_ids and the state
//                                  hash before and after. A write tool or an unknown name throws
//                                  before the world is read, so no store is built; the scratch
//                                  store is local to the call and dropped when it returns.
import { clock } from '../env/clock.ts';
import { loadStore, type FixtureSource } from '../env/fixture-source.ts';
import { stateHash } from '../env/hash.ts';
import { READ_TOOLS, type CatalogEntry, type Policy } from '../env/tools/read/index.ts';
import { callTool, definitions, type ObjectSchema, type ToolResult } from '../env/tools/registry.ts';
import { TOOLS } from '../env/tools/write/index.ts';

export interface CatalogTool {
  name: string;
  description: string;
  inputSchema: ObjectSchema;
  kind: 'read' | 'write';
}

const READ_NAMES = new Set(READ_TOOLS.map((t) => t.name));

export function toolCatalog(): CatalogTool[] {
  return definitions(TOOLS).map((d) => ({ ...d, kind: READ_NAMES.has(d.name) ? 'read' : 'write' }));
}

export interface TryResult {
  result: ToolResult;
  hash_before: string;
  hash_after: string;
}

// policies and catalog are what get_context, read_policy and lookup_catalog answer from; a
// task's, or none.
export async function tryReadTool(name: string, args: unknown, world: FixtureSource, task: { policies?: Policy[]; catalog?: CatalogEntry[] } = {}): Promise<TryResult> {
  const tool = READ_TOOLS.find((t) => t.name === name);
  if (tool === undefined) {
    throw new Error(TOOLS.some((t) => t.name === name) ? `${name} is a write tool; Try runs read tools only` : `no tool ${name}; read tools: ${[...READ_NAMES].join(', ')}`);
  }
  const store = await loadStore(world);
  const hash_before = await stateHash(store.resources());
  const result = callTool([tool], name, args, { world: store, clock, policies: task.policies ?? [], catalog: task.catalog ?? [] });
  return { result, hash_before, hash_after: await stateHash(store.resources()) };
}
