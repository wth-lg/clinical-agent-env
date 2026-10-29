// The rail's views (apps/web/src/data/ViewBody.tsx renders each).
import { BookOpen, Database, FileText, History, LayoutDashboard, ListChecks, Play, type LucideIcon } from 'lucide-react';

export interface View {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const VIEWS: readonly View[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'runs', label: 'Runs', icon: History },
  { id: 'live', label: 'Live trial', icon: Play },
  { id: 'findings', label: 'Findings', icon: FileText },
  { id: 'environment', label: 'Environment', icon: Database },
  { id: 'glossary', label: 'Attribution', icon: BookOpen },
];

export const DEFAULT_VIEW = VIEWS[0]!;

export const viewFromUrl = (href: string): View => VIEWS.find((v) => v.id === new URL(href).searchParams.get('view')) ?? DEFAULT_VIEW;

// A rail link opens the view fresh: the task, label, open trial, its run and its tab of the view
// left behind would be filters nobody set on the new one (review-ui-P14-2 F2, verifier-phase-P16-1
// N1); only the trial detail reads run, and only it and an open task read tab, so nothing else is
// lost.
// check and audit are Runs filters a Findings link sets (P17j JU7; verifier-phase-P17i-JU7-1 S2).
export const VIEW_STATE = ['task', 'label', 'check', 'audit', 'trial', 'run', 'tab'];
// The same for an in-page link (data/url.ts hrefWith, navigate, onNav): a patch that opens view id
// with every VIEW_STATE key cleared except the state given, so a key added to VIEW_STATE is
// cleared by every such link (verifier-phase-P17j-retro-JU5-103-1 D2).
export const freshView = (id: string, state: Record<string, string> = {}): Record<string, string | null> => ({
  ...Object.fromEntries(VIEW_STATE.map((k) => [k, null])),
  ...state,
  view: id,
});
export function viewHref(href: string, id: string): string {
  const url = new URL(href);
  url.searchParams.set('view', id);
  for (const k of VIEW_STATE) url.searchParams.delete(k);
  url.hash = '';
  return `${url.pathname}${url.search}${url.hash}`;
}
