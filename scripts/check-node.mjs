// node scripts/check-node.mjs [version]
// `pnpm start` runs this first, before it installs anything: it exits 1 with one plain sentence
// when this Node is older than engines.node (">=X.Y") in the package.json one directory above
// this file. [version] stands in for this Node's version (tests only). Plain JavaScript with no
// imports beyond node:fs, so an old Node can run it; the repo itself needs type stripping
// (Node 22.18 and newer) to run its .ts files. The install URL is NODE_INSTALL_URL in
// apps/web/src/surface/command.ts; scripts/test/check-node.test.ts holds the two equal.
import { readFileSync } from 'node:fs';

const NODE_INSTALL_URL = 'https://nodejs.org/en/download';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

let wanted;
try {
  wanted = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).engines || {}).node;
} catch (e) {
  fail(`check-node: cannot read package.json: ${e.message}`);
}
const m = typeof wanted === 'string' ? /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(wanted.trim()) : null;
if (!m) fail(`check-node: package.json engines.node must read ">=X.Y", not ${JSON.stringify(wanted)}`);

const version = process.argv[2] || process.versions.node;
const need = [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)];
const have = version.split('.').map(Number);
let older = false;
for (let i = 0; i < 3; i++) {
  if (have[i] !== need[i]) {
    older = have[i] < need[i];
    break;
  }
}
if (older) {
  const shown = wanted.trim().slice(2).trim();
  fail(`clinical-agent-env needs Node.js ${shown} or newer; this computer has ${version}. Install Node.js from ${NODE_INSTALL_URL}, then run the command again.`);
}
