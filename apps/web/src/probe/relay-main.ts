// Test-only page relay-probe.html (P16h): the real-browser relay check
// (e2e/xbrowser/relay-browser.spec.ts). relay-probe.html?relay=<relay Messages URL> defines
// window.clinenvRelayCall, which builds a MessagesClient in the page for that relay (relay.ts);
// the egress guard, installed first, meters the relay origin and allows only the page's own origin
// besides it. Without ?relay= the guard has no options and the page defines nothing. The page has
// its own CSP, so probe.html keeps the design CSP; neither page is in the Pages artifact.
import { installEgressGuard } from '../../../../packages/core/egress.ts';
import { relayCall, relayEndpoint, relayGuardOptions, type RelayOutcome } from './relay.ts';

declare global {
  interface Window {
    clinenvRelayCall?: (apiKey: string) => Promise<RelayOutcome>;
  }
}

installEgressGuard(globalThis, relayGuardOptions(location));

const relay = relayEndpoint(location.search);
if (relay !== null) {
  window.clinenvRelayCall = async (apiKey) => {
    const outcome = await relayCall(relay, apiKey);
    document.body.dataset.relay = outcome.ok ? 'ok' : 'failed';
    return outcome;
  };
}
document.body.dataset.page = 'relay-probe';
