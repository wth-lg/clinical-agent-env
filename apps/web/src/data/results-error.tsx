// The one notice for a results load that failed (eval-p25u-1 defect 5, rubric C12): what did not
// load and what the reader can do, a Retry that loads again in place (results.ts reloadResults),
// and the raw browser message behind Show details, never as the lead. Every view that reads the
// published results shows it (Overview, Runs, Findings, the trial page, Environment's frozen
// worlds), so none is a dead end.
import { CircleAlert } from 'lucide-react';
import { reloadResults } from './results.ts';
import { BUTTON_PRIMARY, Notice } from './ui.tsx';

// message: the load's error (Results kind error). cannot: what this view cannot show without the
// results, after "The published results did not load, so". nested: inside a card.
export function ResultsError({ message, cannot = 'this view has nothing to show yet', testId = 'error-state', nested = false }: { message: string; cannot?: string; testId?: string; nested?: boolean }) {
  return (
    <Notice testId={testId} tone="danger" role="alert" icon={CircleAlert} nested={nested} detail={message} action={<button type="button" className={BUTTON_PRIMARY} onClick={reloadResults}>Retry</button>}>
      <p className="text-ink">The published results did not load, so {cannot}.</p>
      <p className="mt-1">Check your connection, then press Retry. If it fails again, this browser cannot reach the site's data files.</p>
    </Notice>
  );
}
