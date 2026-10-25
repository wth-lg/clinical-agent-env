// The Vercel function (vercel.json rewrites /v1/messages here). It calls handle() with the real
// upstream, one limiter per warm instance and the one origin it serves, and catches anything
// handle throws: the client gets the fixed 502 body, never an error message, and the function
// never rethrows, so the platform logs no stack that could hold a header.
import { createLimiter } from '../src/limiter.ts';
import { corsIfAllowed, handle, relayFailure } from '../src/relay.ts';
import { upstreamFetch } from '../src/upstream.ts';

export const ALLOWED_ORIGIN = 'https://wth-lg.github.io';

const limiter = createLimiter();

export async function respond(request: Request, run: typeof handle = handle): Promise<Response> {
  try {
    return await run(request, upstreamFetch, limiter, ALLOWED_ORIGIN);
  } catch {
    let cors = null;
    try {
      cors = corsIfAllowed(request, ALLOWED_ORIGIN);
    } catch {
      // no readable Origin: no CORS header
    }
    return relayFailure(cors);
  }
}

export default { fetch: (request: Request): Promise<Response> => respond(request) };
