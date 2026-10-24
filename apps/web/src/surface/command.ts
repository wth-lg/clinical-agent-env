// The one command that starts the local runner from a clean clone, and what it needs first.
// The README, the hosted page's local-run panel, the key gate, the runner-down screen and
// `pnpm donewhen` all use these strings; no other source file writes them out.
export const LOCAL_START_COMMAND =
  'git clone https://github.com/wth-lg/clinical-agent-env && cd clinical-agent-env && pnpm start';

// The Node version is engines.node in package.json; scripts/check-node.mjs refuses an older one.
export const LOCAL_PREREQUISITES = 'Requires Node.js 22.18 or newer and pnpm.';
export const NODE_INSTALL_URL = 'https://nodejs.org/en/download';
export const PNPM_INSTALL_URL = 'https://pnpm.io/installation';
// Each prints its version, to check what is installed before running the command.
export const NODE_CHECK_COMMAND = 'node -v';
export const PNPM_CHECK_COMMAND = 'pnpm -v';
