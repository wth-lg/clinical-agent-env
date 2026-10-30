import { useId } from 'react';
import { CARD } from '../data/ui.tsx';
import type { Surface } from './detect.ts';
import { LocalCommand } from './LocalCommand.tsx';

// The id of the panel the shell shows on browser-direct, so the Overview intro card can move focus to it.
export const LOCAL_RUN_PANEL_ID = 'local-run';

const TEXT: Record<Surface['kind'], { title: string; body: string }> = {
  'browser-direct': {
    title: 'Run it on your computer',
    body: 'One command starts the environment on your computer and opens this UI there. The key then stays on your computer.',
  },
  'local-runner': {
    title: 'Start command',
    body: 'The local runner on this computer serves this page. To start it again, or on another computer, run this command.',
  },
};

// The prerequisites and the one command, on every key state and never inside an error: the key
// gate shows it on both surfaces, and the shell keeps it on browser-direct. A relay failure
// (P16h) points here and moves focus here by `id`, so the panel takes programmatic focus only.
export function LocalRunPanel({ surface, id: panelId, className = '' }: { surface: Surface; id?: string; className?: string }) {
  const id = useId();
  const { title, body } = TEXT[surface.kind];
  return (
    <section id={panelId} tabIndex={-1} data-testid="local-run-panel" aria-labelledby={id} className={`${CARD} p-4 sm:p-6 ${className}`}>
      <h2 id={id} className="font-semibold text-ink">
        {title}
      </h2>
      <p className="mt-1 text-ink-muted">{body}</p>
      <div className="mt-3">
        <LocalCommand />
      </div>
    </section>
  );
}
