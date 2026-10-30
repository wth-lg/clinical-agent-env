import { Globe, Server } from 'lucide-react';
import { SURFACE_LABEL, type Surface } from './detect.ts';

const HINT: Record<Surface['kind'], string> = {
  'local-runner': 'Trials run in the local runner on this machine. The key stays in its memory.',
  'browser-direct': 'Trials run in this tab and call the API directly. The key stays in tab memory.',
};

// Below sm only the icon shows; the name stays in the text for assistive technology and in the title.
export function SurfaceChip({ surface }: { surface: Surface }) {
  const Icon = surface.kind === 'local-runner' ? Server : Globe;
  return (
    <span title={`${SURFACE_LABEL[surface.kind]}. ${HINT[surface.kind]}`} className="inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-1.5 text-xs text-ink-muted sm:px-2">
      <Icon aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
      <span data-testid="surface-chip" className="max-sm:sr-only">{SURFACE_LABEL[surface.kind]}</span>
    </span>
  );
}
