// Builds the shared world from committed inputs (design section 2, "One shared world"):
//
//   pnpm fixtures:build [--out <dir>]     <dir> defaults to fixtures/
//
// Base cohort (fixtures/synthea/base.ndjson.gz) + setting (packages/env/world.ts) + every
// tasks/<id>/overlay.ts, through applyOverlays (packages/env/overlay.ts). Writes
// world.ndjson.gz, manifest.json, definitions-pruned.json, and the id maps the world was numbered
// with: ids.ts (each task's registry key -> world id, read through tasks/<id>/ids.ts) and
// synthea-ids.ts (base id -> world id, read through packages/env/synthea-ids.ts). The output
// depends only on the inputs the manifest lists, so fixtures:verify can rebuild it and compare.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire, findPackageJSON } from 'node:module';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NOW, NOW_MS } from '../packages/env/clock.ts';
import { parseNdjson } from '../packages/env/fixture-source.ts';
import { stateHash } from '../packages/env/hash.ts';
import { applyOverlays, type Overlay } from '../packages/env/overlay.ts';
import { Store } from '../packages/env/store.ts';
import { RESOURCE_TYPES, SETTING, SETTING_LINT } from '../packages/env/world.ts';
import { gunzip, gzip, hygiene, sha256, toNdjson, type HygieneReport } from './fixtures-lib.ts';

export const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const BASE = 'fixtures/synthea/base.ndjson.gz';
const BASE_META = 'fixtures/synthea/base.json';
// Code whose bytes the manifest pins, besides each tasks/<id>/overlay.ts: the overlay code, and
// the generator and prune behind base.ndjson.gz, so changing either without regenerating fails
// fixtures:verify.
const OVERLAY_SOURCES = [
  'fixtures/synthea/generate.sh',
  'packages/env/clock.ts',
  'packages/env/overlay.ts',
  'packages/env/renumber.ts',
  'packages/env/world.ts',
  'scripts/fixtures-synthea.ts',
];

const posix = (p: string) => p.split('\\').join('/');

export function taskOverlays(): string[] {
  const tasks = join(repo, 'tasks');
  if (!existsSync(tasks)) return [];
  return readdirSync(tasks, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(tasks, e.name, 'overlay.ts')))
    .map((e) => `tasks/${e.name}/overlay.ts`)
    .sort();
}

export async function loadOverlays(files: readonly string[]): Promise<Overlay[]> {
  const overlays: Overlay[] = [];
  for (const f of files) overlays.push((await import(pathToFileURL(join(repo, f)).href)).default as Overlay);
  return overlays;
}

const requireEnv = createRequire(join(repo, 'packages/env/package.json'));

// The manifest's label for the definitions: the installed package and version.
export function definitionsLabel(): string {
  const file = findPackageJSON('@medplum/definitions', pathToFileURL(join(repo, 'packages/env/package.json')));
  const { name, version } = JSON.parse(readFileSync(file!, 'utf8')) as { name: string; version: string };
  return `${name} ${version}`;
}

// The R4 StructureDefinitions validateResource needs for RESOURCE_TYPES: every data type plus
// those resource types and the base Resource and DomainResource, with the prose fields
// validation never reads removed.
const PROSE = new Set(['definition', 'comment', 'requirements', 'mapping', 'alias', 'short', 'meaning']);
async function prunedDefinitions(types: readonly string[]): Promise<unknown> {
  const { readJson } = (await import(pathToFileURL(requireEnv.resolve('@medplum/definitions')).href)) as { readJson(path: string): { entry: Array<{ resource: Record<string, unknown> }> } };
  const keep = new Set(['Resource', 'DomainResource', ...types]);
  const defs = ['fhir/r4/profiles-types.json', 'fhir/r4/profiles-resources.json']
    .flatMap((f) => readJson(f).entry.map((e) => e.resource))
    .filter((r) => r.resourceType === 'StructureDefinition' && (r.kind !== 'resource' || keep.has(r.id as string)))
    .sort((a, b) => ((a.id as string) < (b.id as string) ? -1 : 1));
  const strip = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(strip) : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !PROSE.has(k)).map(([k, x]) => [k, strip(x)])) : v;
  const entry = defs.map((d) => {
    const { text: _t, description: _d, differential: _df, mapping: _m, ...rest } = d;
    return { resource: strip(rest) };
  });
  return { resourceType: 'Bundle', type: 'collection', entry };
}

// The dates the task files write (YYYY-MM-DD and M/D/YYYY, as YYYY-MM-DD): all of them, and by the
// patients each file names (Patient/pt-NNNN). The hygiene pass leaves a base encounter of such a
// patient on such a date where it is, and moves no encounter off any of them (plan P17j JT2).
export function taskLiteralDates(): { byPatient: Map<string, Set<string>>; all: Set<string> } {
  const out = new Map<string, Set<string>>();
  const all = new Set<string>();
  const walk = (dir: string) => {
    for (const e of readdirSync(join(repo, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.(ts|md|toml|json|txt)$/.test(e.name)) {
        const text = readFileSync(join(repo, rel), 'utf8');
        const dates = [
          // Digit lookarounds, not \b: a date-time's date is followed by T, a word character.
          ...[...text.matchAll(/(?<!\d)(\d{4})-(\d\d)-(\d\d)(?!\d)/g)].map((m) => `${m[1]}-${m[2]}-${m[3]}`),
          ...[...text.matchAll(/(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/g)].map((m) => `${m[3]}-${m[1]!.padStart(2, '0')}-${m[2]!.padStart(2, '0')}`),
        ];
        for (const d of dates) all.add(d);
        for (const pt of new Set(text.match(/\bpt-\d{4}\b/g) ?? [])) {
          const set = out.get(`Patient/${pt}`) ?? new Set<string>();
          for (const d of dates) set.add(d);
          out.set(`Patient/${pt}`, set);
        }
      }
    }
  };
  walk('tasks');
  return { byPatient: out, all };
}

const entries = (m: Record<string, string>, indent: string) => Object.entries(m).map(([k, v]) => `${indent}'${k}': '${v}',\n`).join('');

// fixtures/ids.ts: each task's registry, key -> world id (tasks/<id>/ids.ts reads its own).
export function taskIdsSource(ids: Record<string, Record<string, string>>): string {
  const tasks = Object.keys(ids).sort().map((t) => `  ${t}: {\n${entries(ids[t]!, '    ')}  },\n`).join('');
  return `// Written by pnpm fixtures:build (scripts/fixtures-build.ts); do not edit. Each task's id registry:
// the world id of every resource its overlay adds, by registry key (packages/env/overlay.ts,
// "Planted ids"). tasks/<id>/ids.ts reads its task's entry.
export const TASK_IDS = {
${tasks}} as const;
`;
}

// fixtures/synthea-ids.ts: base id -> world id (packages/env/synthea-ids.ts reads it).
export function syntheaIdsSource(ids: Record<string, string>): string {
  return `// Written by pnpm fixtures:build (scripts/fixtures-build.ts); do not edit. The world id of every
// numbered base cohort resource, by its id in fixtures/synthea/base.ndjson.gz (packages/env/renumber.ts).
export const SYNTHEA_IDS: Readonly<Record<string, string>> = {
${entries(ids, '  ')}};
`;
}

// The clinic PCP every clinic patient without one gets (packages/env/world.ts STAFF: the user).
const CLINIC_PCP = 'pr-okafor';

export async function build(outDir: string): Promise<{ stateHash: string; resources: number; hygiene: HygieneReport }> {
  const baseBytes = readFileSync(join(repo, BASE));
  const baseMeta = JSON.parse(readFileSync(join(repo, BASE_META), 'utf8')) as { ndjson_sha256: string; resources: number };
  const baseSha = sha256(gunzip(baseBytes));
  if (baseSha !== baseMeta.ndjson_sha256) throw new Error(`${BASE} decompresses to ${baseSha}, but ${BASE_META} says ${baseMeta.ndjson_sha256}; rerun fixtures/synthea/generate.sh`);
  // World hygiene (plan P17j JT2) on the base cohort, before the overlays.
  const literalDates = taskLiteralDates();
  const { resources: base, report } = hygiene(await parseNdjson(baseBytes), { now: NOW_MS, literalDates: literalDates.byPatient, anyLiteralDates: literalDates.all });

  const overlayFiles = taskOverlays();
  const overlays = await loadOverlays(overlayFiles);
  const world = applyOverlays(base, SETTING, SETTING_LINT, overlays);
  // After the overlays, a clinic patient with no PCP gets the clinic's (JT2).
  world.resources = world.resources.map((r) => (r.resourceType === 'Patient' && !(r.generalPractitioner?.length) ? { ...r, generalPractitioner: [{ reference: `Practitioner/${CLINIC_PCP}` }] } : r));

  // The Store admits only resources the hash and search can handle.
  const store = new Store(world.resources);
  const hash = await stateHash(store.resources());
  const ndjson = toNdjson(world.resources);
  const byType: Record<string, number> = {};
  for (const r of world.resources) byType[r.resourceType] = (byType[r.resourceType] ?? 0) + 1;
  const types = Object.keys(byType).sort();
  const outside = types.filter((t) => !(RESOURCE_TYPES as readonly string[]).includes(t));
  if (outside.length) throw new Error(`the world holds ${outside.join(', ')}, which RESOURCE_TYPES (packages/env/world.ts) does not list`);
  const defTypes = [...RESOURCE_TYPES].sort();
  const definitions = `${JSON.stringify(await prunedDefinitions(defTypes))}\n`;

  const inputs = Object.fromEntries([...OVERLAY_SOURCES, ...overlayFiles].sort().map((f) => [f, sha256(readFileSync(join(repo, f)))]));
  const idsTs = taskIdsSource(world.ids);
  const syntheaTs = syntheaIdsSource(world.synthea);
  const manifest = {
    now: NOW,
    world: {
      file: 'fixtures/world.ndjson.gz',
      state_hash: hash,
      ndjson_sha256: sha256(ndjson),
      resources: world.resources.length,
      by_type: Object.fromEntries(types.map((t) => [t, byType[t]])),
    },
    base: { file: BASE, ...baseMeta },
    overlays: overlays.map((o) => o.task).sort(),
    inputs,
    definitions: { file: 'fixtures/definitions-pruned.json', from: definitionsLabel(), sha256: sha256(definitions), types: defTypes },
    ids: { file: 'fixtures/ids.ts', sha256: sha256(idsTs), synthea_file: 'fixtures/synthea-ids.ts', synthea_sha256: sha256(syntheaTs) },
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'world.ndjson.gz'), gzip(ndjson));
  writeFileSync(join(outDir, 'definitions-pruned.json'), definitions);
  writeFileSync(join(outDir, 'ids.ts'), idsTs);
  writeFileSync(join(outDir, 'synthea-ids.ts'), syntheaTs);
  // Last: a running local runner reloads its fixtures when manifest.json changes (apps/runner/server.ts).
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { stateHash: hash, resources: world.resources.length, hygiene: report };
}

if (import.meta.main) {
  const i = process.argv.indexOf('--out');
  const out = resolve(i >= 0 ? process.argv[i + 1]! : join(repo, 'fixtures'));
  const { stateHash: hash, resources, hygiene: h } = await build(out);
  console.log(`fixtures:build wrote ${posix(relative(process.cwd(), out)) || '.'}: ${resources} resources, state hash ${hash}`);
  console.log(`hygiene: ${h.moved} encounters moved into clinic hours (to a later weekday: ${h.movedLater.join(', ') || 'none'}); ${h.completedAcute.length} stale acute and ${h.completedDuplicates.length} duplicate orders completed; orders with an unreadable authoredOn: ${h.unreadable.join(', ') || 'none'}; ${Object.keys(h.skipped).length} encounters left: ${Object.entries(h.skipped).map(([id, why]) => `${id} (${why})`).join('; ') || 'none'}`);
}
