// node scripts/check-node.mjs [node-version] [pnpm-version]
// `pnpm start` runs this first, before it installs anything (and `pnpm check-node` on its own):
// it exits 1 with one plain sentence when this Node is older than engines.node (">=X.Y") in the
// package.json one directory above this file, or when the pnpm running it is older than
// engines.pnpm (">=X", the packageManager pin's major). pnpm names its version in
// npm_config_user_agent when it runs a script; run by plain node outside pnpm there is no pnpm
// version to compare, so only Node is checked. Another package manager in the user agent fails:
// the one command runs with pnpm. [node-version] and [pnpm-version] stand in for the versions
// found (tests only). Plain JavaScript with no imports beyond node:fs, so an old Node can run
// it; the repo itself needs type stripping (Node 22.18 and newer) to run its .ts files. The
// install URLs are NODE_INSTALL_URL and PNPM_INSTALL_URL in apps/web/src/surface/command.ts;
// scripts/test/check-node.test.ts holds them equal.
import { readFileSync } from 'node:fs';

const NODE_INSTALL_URL = 'https://nodejs.org/en/download';
const PNPM_INSTALL_URL = 'https://pnpm.io/installation';

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

let engines;
try {
  engines = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).engines || {};
} catch (e) {
  fail(`check-node: cannot read package.json: ${e.message}`);
}

// ">=X.Y.Z" as [X, Y, Z], with the parts it leaves out as 0; null when it is not of that form.
function minimum(wanted) {
  const m = typeof wanted === 'string' ? /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(wanted.trim()) : null;
  return m ? [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)] : null;
}

// Whether version (X.Y.Z) is older than need, compared part by part as numbers.
function older(version, need) {
  const have = version.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (have[i] !== need[i]) return have[i] < need[i];
  }
  return false;
}

const nodeNeed = minimum(engines.node);
if (!nodeNeed) fail(`check-node: package.json engines.node must read ">=X.Y", not ${JSON.stringify(engines.node)}`);
const pnpmNeed = minimum(engines.pnpm);
if (!pnpmNeed) fail(`check-node: package.json engines.pnpm must read ">=X", not ${JSON.stringify(engines.pnpm)}`);
const shownNode = engines.node.trim().slice(2).trim();
const shownPnpm = engines.pnpm.trim().slice(2).trim();

const nodeVersion = process.argv[2] || process.versions.node;
if (older(nodeVersion, nodeNeed)) {
  fail(`clinical-agent-env needs Node.js ${shownNode} or newer; this computer has ${nodeVersion}. Install Node.js from ${NODE_INSTALL_URL}, then run the command again.`);
}

// The pnpm that runs this script, from its user agent ("pnpm/12.14.0 npm/? node/v26.12.0 ...").
const agent = process.env.npm_config_user_agent || '';
const pnpmVersion = process.argv[3] || (/(?:^|\s)pnpm\/(\d+\.\d+\.\d+)/.exec(agent) || [])[1] || null;
if (pnpmVersion === null) {
  const other = /^([a-z]+)\//.exec(agent);
  if (other) fail(`clinical-agent-env needs pnpm ${shownPnpm} or newer; this command was run with ${other[1]}. Install pnpm from ${PNPM_INSTALL_URL}, then run the command again with pnpm.`);
} else if (older(pnpmVersion, pnpmNeed)) {
  fail(`clinical-agent-env needs pnpm ${shownPnpm} or newer; this computer has pnpm ${pnpmVersion}. Install pnpm from ${PNPM_INSTALL_URL}, then run the command again.`);
}
