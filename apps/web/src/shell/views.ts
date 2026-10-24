// The rail's views (apps/web/src/data/ViewBody.tsx renders each). `empty` says what the view holds.
import { BookOpen, Database, FileText, History, LayoutDashboard, ListChecks, type LucideIcon } from 'lucide-react';

export interface View {
  id: string;
  label: string;
  icon: LucideIcon;
  empty: string;
}

export const VIEWS: readonly View[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, empty: 'One row per task for the committed final run: pass k of N with its 95% interval, one swatch per trial, mean score and cost.' },
  { id: 'tasks', label: 'Tasks', icon: ListChecks, empty: 'The six tasks, each with its prompt, policy, required end state, rubric, reference solution and grader validation, and Run trial.' },
  { id: 'runs', label: 'Runs', icon: History, empty: 'The official, pilot and exploit runs, and the runs you start in this session, with status, cost and pass rate.' },
  { id: 'findings', label: 'Findings', icon: FileText, empty: 'The write-up: pass rates with intervals, the failure taxonomy, and links from each claim to example trajectories.' },
  { id: 'environment', label: 'Environment', icon: Database, empty: 'The pinned clock, world hash, resource counts, Verify reset, and the tool catalogue with a keyless Try panel.' },
  { id: 'glossary', label: 'Labels', icon: BookOpen, empty: 'How failures are attributed: the fault definitions and their criteria, the label each fault gives, the pass definition and the denominator rule.' },
];

export const DEFAULT_VIEW = VIEWS[0]!;

export const viewFromUrl = (href: string): View => VIEWS.find((v) => v.id === new URL(href).searchParams.get('view')) ?? DEFAULT_VIEW;

export function viewHref(href: string, id: string): string {
  const url = new URL(href);
  url.searchParams.set('view', id);
  return `${url.pathname}${url.search}${url.hash}`;
}
