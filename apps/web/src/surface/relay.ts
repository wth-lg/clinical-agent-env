// The hosted relay (plan phase P16h, apps/relay): on the hosted site every Messages call, Validate
// and the trial Worker's, goes to RELAY_URL, which forwards it to the API server to server. This
// file is the one place the relay host is written (lint: no-direct-anthropic): APP_CSP's
// connect-src (apps/web/csp.ts), the hosted MessagesClient options and the egress guard's
// metered origin all come from here. RELAY_URL is the planned production URL of the Vercel
// project clinical-agent-env-relay; the deploy confirms it.
import type { ClientOptions } from '../../../../packages/core/anthropic.ts';
import type { EgressOptions } from '../../../../packages/core/egress.ts';

export const RELAY_ORIGIN = 'https://clinical-agent-env-relay.vercel.app';
export const RELAY_URL = `${RELAY_ORIGIN}/v1/messages`;

// What every hosted MessagesClient is built with besides its grant, ledger and key: P16g's
// endpoint option, so the client builds and registers its own Request to the relay, and no
// Transport resends or edits it.
export const HOSTED_CLIENT_OPTIONS: Pick<ClientOptions, 'endpoint'> = { endpoint: RELAY_URL };

// The egress guard of a scope that holds a hosted client (the page and the trial Worker): only
// the client's registered Request reaches the relay, once, and nothing goes anywhere but the
// scope's own origin and the relay.
export const hostedGuard = (self: string): EgressOptions => ({ allowedOrigins: [self, RELAY_ORIGIN], meteredOrigins: [RELAY_ORIGIN] });
