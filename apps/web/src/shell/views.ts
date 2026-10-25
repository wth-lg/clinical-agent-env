// The rail's views (apps/web/src/data/ViewBody.tsx renders each).
import { BookOpen, Database, FileText, History, LayoutDashboard, ListChecks, type LucideIcon } from 'lucide-react';

export interface View {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const VIEWS: readonly View[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'runs', label: 'Runs', icon: History },
  { id: 'findings', label: 'Findings', icon: FileText },
  { id: 'environment', label: 'Environment', icon: Database },
  { id: 'glossary', label: 'Labels', icon: BookOpen },
];

export const DEFAULT_VIEW = VIEWS[0]!;

export const viewFromUrl = (href: string): View => VIEWS.find((v) => v.id === new URL(href).searchParams.get('view')) ?? DEFAULT_VIEW;

// A rail link opens the view fresh: the task, label and open trial of the view left behind would
// be filters nobody set on the new one (review-ui-P14-2 F2), so only ?view= changes and the rest
// of the query (e.g. a run choice) stays.
export const VIEW_STATE = ['task', 'label', 'trial'];
export function viewHref(href: string, id: string): string {
  const url = new URL(href);
  url.searchParams.set('view', id);
  for (const k of VIEW_STATE) url.searchParams.delete(k);
  url.hash = '';
  return `${url.pathname}${url.search}${url.hash}`;
}
