import { Globe, Server } from 'lucide-react';
import { SURFACE_LABEL, type Surface } from './detect.ts';

// The hosted hint agrees with the key gate: calls go through the relay (P25u A17).
const HINT: Record<Surface['kind'], string> = {
  'local-runner': 'Trials run in the local runner on this machine. The key stays in its memory.',
  'browser-direct': 'Trials run in this tab; calls go to the API through a relay that keeps no copy. The key stays in tab memory.',
};

// The one-word form for a phone (P25u A17): below sm the full name is for assistive technology
// only, and this word shows beside the icon.
const SHORT: Record<Surface['kind'], string> = { 'local-runner': 'Local', 'browser-direct': 'Hosted' };

export function SurfaceChip({ surface }: { surface: Surface }) {
  const Icon = surface.kind === 'local-runner' ? Server : Globe;
  return (
    <span title={`${SURFACE_LABEL[surface.kind]}. ${HINT[surface.kind]}`} className="inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-1.5 text-xs text-ink-muted sm:px-2">
      <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
      <span data-testid="surface-chip" className="max-sm:sr-only">{SURFACE_LABEL[surface.kind]}</span>
      <span aria-hidden data-testid="surface-short" className="sm:hidden">{SHORT[surface.kind]}</span>
    </span>
  );
}
