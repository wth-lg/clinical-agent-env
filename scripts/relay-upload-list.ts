// node scripts/relay-upload-list.ts [--vercel <dir of the installed vercel package>]
// What `vercel deploy --cwd apps/relay` uploads, read from the installed Vercel CLI itself (plan
// phase P16h, README Deploy step 4): imports the @vercel/client bundled in the CLI's dist, runs its
// buildFileTree, the walker createDeployment uploads from, on apps/relay, and prints the list.
// Exits 1 when the list is not UPLOAD_LIST, 2 when the CLI or its walker cannot be found. Without
// --vercel it looks in the npm and pnpm global roots for the vercel package whose version is the
// one `vercel --version` prints, so it reads the same CLI that will deploy.
// apps/relay/test/config.test.ts checks the same list in CI with a copy of the walker's rule.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const REPO = fileURLToPath(new URL('../', import.meta.url));
const RELAY = join(REPO, 'apps/relay');

// The function, the sources it imports, vercel.json, public/ (apps/relay/README.md, "Static files"),
// and the package.json and tsconfig.json the builder compiles with (README.md, "Build").
export const UPLOAD_LIST = ['api/messages.ts', 'package.json', 'public/README.md', 'src/limiter.ts', 'src/relay.ts', 'src/upstream.ts', 'tsconfig.json', 'vercel.json'];

type BuildFileTree = (path: string, opts: { isDirectory: boolean; prebuilt: boolean }, debug: (s: string) => void) => Promise<{ fileList: string[] }>;

function sh(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const versionOf = (pkg: string) => (JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')) as { version: string }).version;

// npm installs at <root>/vercel, pnpm at <root>/<hash>/node_modules/vercel.
function findVercel(): string {
  const version = sh('vercel', ['--version']).split('\n').pop()!.trim();
  if (!version) throw new Error('`vercel --version` printed nothing; install the CLI or pass --vercel');
  const candidates: string[] = [];
  const npmRoot = sh('npm', ['root', '-g']);
  if (npmRoot) candidates.push(join(npmRoot, 'vercel'));
  const pnpmRoot = sh('pnpm', ['root', '-g']);
  if (pnpmRoot && existsSync(pnpmRoot)) for (const d of readdirSync(pnpmRoot)) candidates.push(join(pnpmRoot, d, 'node_modules/vercel'));
  const found = candidates.find((c) => existsSync(join(c, 'package.json')) && versionOf(c) === version);
  if (!found) throw new Error(`no vercel ${version} package under the npm or pnpm global root; pass --vercel`);
  return found;
}

// The CLI bundles @vercel/client into one chunk whose name changes between releases.
async function cliBuildFileTree(pkg: string): Promise<{ buildFileTree: BuildFileTree; client: string }> {
  const chunks = join(pkg, 'dist/chunks');
  for (const name of readdirSync(chunks).filter((n) => n.endsWith('.js'))) {
    const text = readFileSync(join(chunks, name), 'utf8');
    const client = /"@vercel\/client",version:"([^"]+)"/.exec(text);
    if (!client || !text.includes('function buildFileTree')) continue;
    const mod = (await import(pathToFileURL(join(chunks, name)).href)) as { require_dist?: () => { buildFileTree?: BuildFileTree } };
    const buildFileTree = mod.require_dist?.().buildFileTree;
    if (typeof buildFileTree === 'function') return { buildFileTree, client: client[1]! };
  }
  throw new Error(`no chunk under ${chunks} exports @vercel/client's buildFileTree`);
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { vercel: { type: 'string' } } });
  let walk: { buildFileTree: BuildFileTree; client: string };
  let pkg: string;
  try {
    pkg = values.vercel ?? findVercel();
    walk = await cliBuildFileTree(pkg);
  } catch (e) {
    console.error(`relay-upload-list: ${(e as Error).message}`);
    return 2;
  }
  const { fileList } = await walk.buildFileTree(RELAY, { isDirectory: true, prebuilt: false }, () => {});
  const list = fileList.map((f) => relative(RELAY, f).split('\\').join('/')).sort();
  const ok = JSON.stringify(list) === JSON.stringify(UPLOAD_LIST);
  console.log(`relay-upload-list: vercel ${versionOf(pkg)} (@vercel/client ${walk.client}) uploads from apps/relay:`);
  for (const f of list) console.log(`  ${f}`);
  console.log(ok ? 'matches the expected upload list' : `NOT the expected upload list: ${UPLOAD_LIST.join(' ')}`);
  return ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main();
