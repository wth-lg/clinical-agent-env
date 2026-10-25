import { useId } from 'react';
import type { Surface } from './detect.ts';
import { LocalCommand } from './LocalCommand.tsx';

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
// gate shows it on both surfaces, and the shell keeps it on browser-direct.
export function LocalRunPanel({ surface, className = '' }: { surface: Surface; className?: string }) {
  const id = useId();
  const { title, body } = TEXT[surface.kind];
  return (
    <section data-testid="local-run-panel" aria-labelledby={id} className={`rounded-sm border border-line bg-surface p-4 sm:p-6 ${className}`}>
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
