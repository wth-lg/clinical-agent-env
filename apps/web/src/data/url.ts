// View state in the URL's query (?view=runs&task=...&label=...&trial=...), so a screen can be
// shared and survives a refresh. navigate() pushes a new entry and tells the shell, which
// listens for popstate, to read the URL again.
import { useEffect, useState } from 'react';

export function hrefWith(patch: Record<string, string | null>): string {
  const url = new URL(location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '') url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function navigate(patch: Record<string, string | null>): void {
  history.pushState(null, '', hrefWith(patch));
  dispatchEvent(new PopStateEvent('popstate'));
}

// A link's click handler: a plain left click navigates in place, a modified click opens the
// href as the browser would.
export const onNav = (patch: Record<string, string | null>) => (e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; button: number; preventDefault(): void }) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate(patch);
};

export function useParams(): URLSearchParams {
  const [search, setSearch] = useState(() => location.search);
  useEffect(() => {
    const on = () => setSearch(location.search);
    addEventListener('popstate', on);
    return () => removeEventListener('popstate', on);
  }, []);
  return new URLSearchParams(search);
}
