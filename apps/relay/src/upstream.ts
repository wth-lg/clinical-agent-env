// The one relay module that names the upstream URL; lint (no-direct-anthropic) exempts exactly
// this file and its test by path, and every other relay file imports UPSTREAM_URL. upstreamFetch
// sends to that URL only, and refuses a redirect, so the host it was given is the host the key
// reaches.
import type { UpstreamFetch } from './relay.ts';

export const UPSTREAM_URL = 'https://api.anthropic.com/v1/messages';

export const upstreamFetch: UpstreamFetch = (url, init) => {
  if (url !== UPSTREAM_URL) return Promise.reject(new TypeError('the relay sends only to its upstream'));
  return fetch(url, { ...init, redirect: 'error' });
};
