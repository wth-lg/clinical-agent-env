import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installEgressGuard } from '../../../packages/core/egress.ts';
import { dropRemembered, heldByRunner, restoreRemembered } from './keygate/key.ts';
import { runnerToken } from './keygate/runner.ts';
import { App } from './shell/App.tsx';
import { refreshSpent } from './spend/session.ts';
import { detect } from './surface/detect.ts';
import { hostedGuard } from './surface/relay.ts';
import { RunnerDown } from './surface/RunnerDown.tsx';
import './styles/app.css';

// The page holds the hosted Validate client: the relay is metered, so only that client's Request
// reaches it, and the page sends nowhere but its own origin and the relay (P16h).
installEgressGuard(globalThis, hostedGuard(location.origin));

// The surface is detected once, before the first render, so the gate never shows the wrong
// key path. A runner that already holds a key skips the gate. The tab ledger is read back
// before the meter first shows, so a reload keeps the session's spend.
const [surface] = await Promise.all([detect(runnerToken() !== null), refreshSpent()]);
if (surface.kind === 'local-runner') {
  dropRemembered();
  if (surface.health.key_loaded) heldByRunner();
} else if (surface.kind === 'browser-direct') {
  restoreRemembered();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>{surface.kind === 'runner-down' ? <RunnerDown /> : <App surface={surface} />}</StrictMode>,
);
