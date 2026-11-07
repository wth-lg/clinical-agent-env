// The browser tab's title (P25u J13): the view, and the task or trial it shows, so tabs, history
// and bookmarks can be told apart: "Overview · Riverbend", "renal-dose-review · Tasks · Riverbend",
// "contrast-ct-prep/0 · Runs · Riverbend". The shell sets it from the URL on every navigation
// (App.tsx). A view that resolves more than the URL says (the trial page, which knows the
// outcome; a token such as trial=first-nonpass) sets its own with titleOf once it has loaded. The
// key gate keeps BASE_TITLE, the product's full name from index.html.
import { viewFromUrl } from './views.ts';

export const SITE = 'Riverbend';
export const BASE_TITLE = 'Riverbend clinical agent environment';
// The tokens the URL may carry in place of an id (docs/requirements/ui-contract.md Tokens).
const TOKENS = ['first-nonpass', 'session'];

export const titleOf = (parts: readonly string[]): string => [...parts, SITE].join(' · ');

export function documentTitle(href: string): string {
  const view = viewFromUrl(href);
  const q = new URL(href).searchParams;
  const named = (key: string) => {
    const v = q.get(key);
    return v !== null && v !== '' && !TOKENS.includes(v) ? [v] : [];
  };
  const subject = view.id === 'runs' ? named('trial') : view.id === 'tasks' || view.id === 'live' ? named('task') : [];
  return titleOf([...subject, view.label]);
}
