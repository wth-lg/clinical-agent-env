// The runtime egress guard. Lint (no-direct-anthropic) sees only how a URL is written; the guard
// sees where it resolves. installEgressGuard(globalThis) wraps the scope's fetch and refuses any
// request whose WHATWG-parsed host is an API host (isApiHost in anthropic.ts: %2E, IDNA dots,
// case, templates and joins all resolve to it) unless it is the Request MessagesClient registered
// for the call in flight, sent once, unchanged and with no init (claimOutbound). A Request's URL
// and headers are read from its internal slots (requestUrl). Every forwarded call carries the
// guard's own dispatcher (forwardInit), so one the caller supplied by any route, in fetch's init
// or in a Request's, is never used. In Node the guard also takes undici's global dispatcher
// slots: each holds a dispatcher that refuses an API-host origin and is locked, so request(),
// dispatch(), stream(), connect() and the rest refuse whatever name the caller reached the slot
// by, a fetch with no dispatcher of its own (one captured before install, or a redirect hop)
// is checked again, and nothing can swap the slot. Only the claimed MessagesClient Request is
// forwarded with the raw dispatcher. A refusal is an EgressRefusal: nothing was sent. XMLHttpRequest,
// WebSocket, EventSource, WebTransport, navigator.sendBeacon and fetchLater (Chromium's deferred
// fetch), where present, are refused for those hosts outright: the client never uses them. A URL is resolved once and the resolved string is what
// gets sent, so an object whose toString answers differently the second time sends nothing new.
// With allowedOrigins (the browser trial Worker), a send by any of those APIs to an origin not in
// the list is refused as well; the API host stays reachable only by the claimed MessagesClient
// Request, listed or not. In that mode every other fetch is forwarded with redirect: 'error', so a
// listed origin cannot redirect it elsewhere, and XMLHttpRequest and EventSource, which follow
// redirects with no way to opt out, are refused whatever the origin. This is the second layer:
// the trial Worker starts from a blob: URL, so the page's CSP binds it and the browser refuses
// other origins on every hop (apps/web/src/live/transport/worker.ts).
// With meteredOrigins (a relay that forwards to the API, P16h), each listed origin is guarded
// exactly like the API host, by every API above and by the undici slots: only the claimed
// MessagesClient Request reaches it, once. An origin is compared after WHATWG parsing (case,
// %2E, IDNA dots and a default port resolve) with a trailing dot dropped and ws/wss read as
// http/https, so every spelling of the relay's origin meets the check (meteredKey).
// The wrapped globals are made read-only, so later code cannot put the raw ones back. Each is
// also wrapped and locked on every prototype of its holder that defines it: a browser Worker
// keeps fetch on WorkerGlobalScope.prototype and a page keeps sendBeacon on Navigator.prototype,
// where `Proto.fetch.call(self, ...)` would otherwise reach the raw function. The entry
// point passes its global scope in, since shared code does not touch DOM or Node globals
// (lint: isomorphic-imports).
//
// Residuals of an in-page guard (decisions.tsv 2026-10-28T09:30, verifier-phase-P17i-P16h-web2r2-1
// S1 and S3): the guard wraps the globals of the realm it is installed in, so a new realm has raw
// ones (a same-origin about:blank iframe, a blob: Worker or SharedWorker, a popup), and a
// navigation or `<link rel=prefetch>` sends without any API the guard wraps. The CSP and the
// relay's Origin check are the outer limits there. Code that can create a realm already runs in
// the page and holds the key; the guard meters the app's own code paths and is defence in depth.
//
// Every entry point that can make live calls installs it as its first statement: the cli/index.ts
// dispatcher, scripts/live-node.ts, the web app and the probe page (later: the local runner, and
// the Worker that hosts the browser client). See anthropic.ts for the threat model.
import { claimOutbound, EgressRefusal, isApiHost, requestUrl } from './anthropic.ts';

let installed = false;

export interface EgressOptions {
  // The origins this context may send to besides the API host (each parsed as a URL; its origin
  // counts). Unset: any origin but the API host.
  allowedOrigins?: readonly string[];
  // Origins guarded like the API host: a relay that forwards to it, which MessagesClient reaches
  // through its endpoint option. Unset: the API host only.
  meteredOrigins?: readonly string[];
}

// The allowed origins, or null for any.
let allowed: ReadonlySet<string> | null = null;
// The metered origins besides the API host, by meteredKey.
let metered: ReadonlySet<string> = new Set();

// An origin as the metered check compares it: the parsed scheme, host and port, with a
// trailing dot dropped from the host (it names the same DNS host) and ws/wss read as
// http/https (the mapping fetch applies to a WebSocket URL).
function meteredKey(url: URL): string {
  const scheme = url.protocol === 'wss:' ? 'https:' : url.protocol === 'ws:' ? 'http:' : url.protocol;
  return `${scheme}//${url.hostname.replace(/\.+$/, '')}${url.port === '' ? '' : `:${url.port}`}`;
}

// Whether only the claimed MessagesClient Request may reach this URL: the API host, or a
// metered origin.
const isMetered = (url: URL): boolean => isApiHost(url.hostname) || metered.has(meteredKey(url));

const refused = (api: string, url: URL) =>
  new EgressRefusal(`egress guard: ${api} to ${url.origin} refused: only MessagesClient (packages/core/anthropic.ts) sends to the Anthropic API or a metered relay, once per registered Request`);

// Throws for an origin outside allowedOrigins. A metered origin is checked by the callers first.
function admit(api: string, url: URL): void {
  if (allowed !== null && !isMetered(url) && !allowed.has(url.origin)) {
    throw new EgressRefusal(`egress guard: ${api} to ${url.origin} refused: this context sends only to ${[...allowed].join(', ')} and the Anthropic API`);
  }
}

// The globals the guard wraps, where the runtime has them.
interface Scope {
  fetch?: typeof fetch;
  XMLHttpRequest?: { prototype?: { open?: (...a: unknown[]) => void } };
  WebSocket?: unknown;
  WebTransport?: unknown;
  EventSource?: unknown;
  fetchLater?: (input: unknown, init?: RequestInit) => unknown;
  navigator?: { sendBeacon?: (url: unknown, data?: unknown) => boolean };
  document?: { baseURI?: string };
  location?: { href?: string };
}

let base: string | undefined;
// Node's global undici dispatcher at install (undici 8, then the undici 6 symbol), or undefined
// where fetch takes no dispatcher (browsers). Only the claimed MessagesClient Request is sent
// with it; every other forwarded call gets the guarded one that replaced it in the slots.
let dispatcher: unknown;
let guardedDispatcher: unknown;

// undici's registry keys for the global dispatcher (lib/global.js): .2 holds the Agent, .1 the
// same Agent behind a wrapper for undici 6 handlers.
const SLOT = Symbol.for('undici.globalDispatcher.2');
const LEGACY_SLOT = Symbol.for('undici.globalDispatcher.1');

// The part of undici's Dispatcher the guard touches.
interface Dispatcher {
  dispatch(opts: object, handler: object): boolean;
  close(...a: unknown[]): unknown;
  destroy(...a: unknown[]): unknown;
  webSocketOptions?: unknown;
  eventSourceOptions?: unknown;
}

// The URL as the platform would resolve it against the page's base, or null when it does not parse.
function resolveUrl(s: string): URL | null {
  try {
    return new URL(s, base);
  } catch {
    return null;
  }
}

// The string to send: the resolved URL, after refusing a metered origin.
function checked(api: string, input: unknown): string {
  const s = String(input);
  const url = resolveUrl(s);
  if (url === null) return s; // the platform rejects it the same way
  if (isMetered(url)) throw refused(api, url);
  admit(api, url);
  return url.href;
}

// The init to forward: a copy of its own properties with the dispatcher captured at install. A
// caller's dispatcher would pick the connection below the guard. Node's fetch uses
// `init.dispatcher || request's dispatcher` (undici's Request constructor), so the captured one
// also overrides a dispatcher set in `new Request(url, { dispatcher })` or inherited from the
// Request it copied. An inherited init property is not copied. The claimed client Request gets
// the raw dispatcher; anything else gets the guarded one, so a redirect to the API host is
// refused at the hop. Without a captured dispatcher, the copy has none. With allowedOrigins, an
// unclaimed call is forwarded with redirect: 'error', which overrides a Request's own mode too.
function forwardInit(init: RequestInit | undefined, claimed: boolean): RequestInit | undefined {
  const use = claimed ? dispatcher : guardedDispatcher;
  const noRedirect = !claimed && allowed !== null;
  const own = typeof init === 'object' || typeof init === 'function';
  if (!own && init != null) return init; // the platform rejects it the same way
  if (!own && use === undefined && !noRedirect) return init;
  const copy: Record<string, unknown> = own ? { ...init } : {};
  delete copy.dispatcher;
  if (use !== undefined) copy.dispatcher = use;
  if (noRedirect) copy.redirect = 'error';
  return copy;
}

// With allowedOrigins, XMLHttpRequest and EventSource are refused outright.
function followsRedirects(api: string): void {
  if (allowed !== null) throw new EgressRefusal(`egress guard: ${api} refused: this context sends by fetch only, which may not follow a redirect`);
}

// A dispatcher that refuses a metered origin and hands everything else to `raw`. It extends
// undici's own Dispatcher class (found on raw's prototype chain), whose request(), stream(),
// pipeline(), upgrade(), connect() and compose() all end in this.dispatch, so every method
// meets the check; raw stays in this closure, never on the object. The origin is read once, from
// a copy of opts, and the string checked is the one raw gets.
function guardDispatcher(raw: Dispatcher): Dispatcher {
  let proto: object | null = Object.getPrototypeOf(raw) as object | null;
  while (proto !== null && !Object.prototype.hasOwnProperty.call(proto, 'request')) proto = Object.getPrototypeOf(proto) as object | null;
  const Base = (proto?.constructor ?? Object) as Ctor;
  return new (class extends Base {
    dispatch(opts: object, handler: object): boolean {
      const copy: Record<string, unknown> = { ...opts };
      const origin = copy.origin;
      if (typeof origin === 'string' || origin instanceof URL) {
        const s = String(origin);
        const url = new URL(s);
        if (isMetered(url)) throw refused('undici dispatcher', url);
        copy.origin = s;
      }
      return raw.dispatch(copy, handler);
    }
    close(...a: unknown[]): unknown {
      return raw.close(...a);
    }
    destroy(...a: unknown[]): unknown {
      return raw.destroy(...a);
    }
    get webSocketOptions(): unknown {
      return raw.webSocketOptions;
    }
    get eventSourceOptions(): unknown {
      return raw.eventSourceOptions;
    }
  })() as unknown as Dispatcher;
}

type Ctor = new (...args: unknown[]) => object;

function lock(target: object, key: string | symbol, value: unknown): void {
  Object.defineProperty(target, key, { value, writable: false, configurable: false, enumerable: false });
}

// Locks value as target's own key and on every prototype of target that defines key itself.
function lockChain(target: object, key: string, value: unknown): void {
  lock(target, key, value);
  for (let p = Object.getPrototypeOf(target) as object | null; p !== null; p = Object.getPrototypeOf(p) as object | null) {
    if (Object.prototype.hasOwnProperty.call(p, key)) lock(p, key, value);
  }
}


export function installEgressGuard(scope: object, opts: EgressOptions = {}): void {
  if (installed) return;
  installed = true;
  if (opts.allowedOrigins !== undefined) allowed = new Set(opts.allowedOrigins.map((o) => new URL(o).origin));
  if (opts.meteredOrigins !== undefined) metered = new Set(opts.meteredOrigins.map((o) => meteredKey(new URL(o))));
  const g = scope as Scope;
  base = g.document?.baseURI ?? g.location?.href;
  // Reading Request loads Node's undici, which sets the global dispatcher.
  void (g as { Request?: unknown }).Request;
  const slots = scope as Record<symbol, unknown>;
  dispatcher = slots[SLOT] ?? slots[LEGACY_SLOT];
  if (typeof (dispatcher as Dispatcher | undefined)?.dispatch === 'function') {
    const guarded = guardDispatcher(dispatcher as Dispatcher);
    // The .1 slot keeps undici's wrapper class, now around the guarded dispatcher.
    const Legacy = (slots[LEGACY_SLOT] as { constructor?: unknown } | undefined)?.constructor;
    guardedDispatcher = guarded;
    // undici defines both slots non-configurable but writable; locking them makes a later
    // assignment or setGlobalDispatcher throw.
    lock(scope, SLOT, guarded);
    lock(scope, LEGACY_SLOT, typeof Legacy === 'function' && slots[LEGACY_SLOT] !== dispatcher ? new (Legacy as Ctor)(guarded) : guarded);
  }

  const raw = g.fetch;
  if (typeof raw === 'function') {
    const guarded = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      try {
        // A real Request is checked by the URL in its slot, which is what fetch sends.
        const href = requestUrl(input);
        if (href !== null) {
          const url = resolveUrl(href);
          const claimed = url !== null && isMetered(url);
          if (claimed && !claimOutbound(input, init)) throw refused('fetch', url);
          if (url !== null) admit('fetch', url);
          return raw.call(scope, input, forwardInit(init, claimed));
        }
        return raw.call(scope, checked('fetch', input), forwardInit(init, false));
      } catch (e) {
        return Promise.reject(e);
      }
    };
    lockChain(scope, 'fetch', guarded);
  }

  // fetchLater sends later, unclaimed by MessagesClient, so a metered origin is refused outright.
  const later = g.fetchLater;
  if (typeof later === 'function') {
    lockChain(scope, 'fetchLater', (input: unknown, init?: RequestInit) => {
      const href = requestUrl(input);
      if (href === null) return later.call(scope, checked('fetchLater', input), forwardInit(init, false));
      const url = resolveUrl(href);
      if (url !== null && isMetered(url)) throw refused('fetchLater', url);
      if (url !== null) admit('fetchLater', url);
      return later.call(scope, input, forwardInit(init, false));
    });
  }

  const xhr = g.XMLHttpRequest;
  const open = xhr?.prototype?.open;
  if (xhr?.prototype && typeof open === 'function') {
    lock(xhr.prototype, 'open', function (this: unknown, method: unknown, url: unknown, ...rest: unknown[]) {
      followsRedirects('XMLHttpRequest');
      return open.call(this, method, checked('XMLHttpRequest', url), ...rest);
    });
  }

  // Each constructor is replaced by a plain function that builds the raw one through
  // Reflect.construct, not by `class extends C`: a subclass's own prototype is C, so
  // Object.getPrototypeOf(Guarded) handed back the raw constructor (verifier-phase-P17i-P16h-web2r2-1
  // S2). Guarded shares C.prototype, so instanceof holds, and C.prototype.constructor is locked to
  // Guarded; C's statics (CONNECTING, OPEN, ...) are copied across.
  for (const name of ['WebSocket', 'EventSource', 'WebTransport'] as const) {
    const C = g[name];
    if (typeof C !== 'function') continue;
    const Guarded = function (this: unknown, url: unknown, ...rest: unknown[]): object {
      if (new.target === undefined) throw new TypeError(`Failed to construct '${name}': Please use the 'new' operator.`);
      if (name === 'EventSource') followsRedirects(name);
      return Reflect.construct(C as Ctor, [checked(name, url), ...rest], new.target) as object;
    };
    for (const key of Reflect.ownKeys(C)) {
      if (key === 'prototype' || key === 'length' || key === 'name' || key === 'caller' || key === 'arguments') continue;
      Object.defineProperty(Guarded, key, Object.getOwnPropertyDescriptor(C, key)!);
    }
    Object.defineProperty(Guarded, 'name', { value: name });
    Object.defineProperty(Guarded, 'length', { value: (C as Ctor).length });
    Object.defineProperty(Guarded, 'prototype', { value: (C as { prototype: object }).prototype, writable: false });
    lock((C as { prototype: object }).prototype, 'constructor', Guarded);
    lockChain(scope, name, Guarded);
  }

  const nav = g.navigator;
  const beacon = nav?.sendBeacon;
  if (nav && typeof beacon === 'function') {
    lockChain(nav, 'sendBeacon', (url: unknown, data?: unknown) => beacon.call(nav, checked('sendBeacon', url), data));
  }
}
