// Test-only page: the real-browser POST check (e2e/live/browser-post.spec.ts). It holds no
// key: the spec's MessagesClient, in Node, sends through pageFetch here, passing the request
// (key included) as a page.evaluate argument, never in a URL or storage. The page installs the
// egress guard like every entry point; the relay keeps the fetch from before it, because the
// Request it forwards was registered and claimed on the Node side (relayFetch), and a Request
// cannot cross into the page. window.clinenvFetch is the page's one path to the API host.
// probe.html?relay=<url> is the relay mode instead (relay.ts, P16h): the page builds its own
// MessagesClient for that relay, the guard meters the relay origin, and window.clinenvFetch is
// not defined, so the client's Request is the page's only way to the relay.
import { installEgressGuard } from '../../../../packages/core/egress.ts';
import { relayCall, relayEndpoint, relayGuardOptions, type RelayOutcome } from './relay.ts';
import { pageFetch, type PageReply, type PageRequest } from './transport.ts';

declare global {
  interface Window {
    clinenvFetch?: (url: string, req: PageRequest) => Promise<PageReply>;
    clinenvRelayCall?: (apiKey: string) => Promise<RelayOutcome>;
  }
}

const send = globalThis.fetch.bind(globalThis);
installEgressGuard(globalThis, relayGuardOptions(location));

const relay = relayEndpoint(location.search);
if (relay === null) {
  window.clinenvFetch = (url, req) => pageFetch(send, url, req);
} else {
  window.clinenvRelayCall = async (apiKey) => {
    const outcome = await relayCall(relay, apiKey);
    document.body.dataset.relay = outcome.ok ? 'ok' : 'failed';
    return outcome;
  };
}
document.body.dataset.page = 'probe';
