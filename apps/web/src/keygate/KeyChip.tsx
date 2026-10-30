import { KeyRound } from 'lucide-react';
import type { KeyStatus } from './key.ts';
import { BUTTON, BUTTON_PRIMARY } from '../data/ui.tsx';

// Small buttons in the top bar; a 44px target on a touch screen.
const SMALL = 'h-6 px-2 text-xs pointer-coarse:h-11';

const label = (s: KeyStatus) => (s.kind === 'tab' ? s.masked : s.kind === 'runner' ? 'Key held by runner' : 'No key');

// The key's status in the top bar, with Forget key when there is one and Add key when not.
export function KeyChip({ status, onForget, onAdd, busy }: { status: KeyStatus; onForget: () => void; onAdd: () => void; busy: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2 text-xs text-ink-muted">
        <KeyRound aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span data-testid="key-chip" className={status.kind === 'tab' ? 'font-mono' : undefined}>{label(status)}</span>
      </span>
      {status.kind === 'none' ? (
        <button type="button" onClick={onAdd} className={`${BUTTON_PRIMARY} ${SMALL}`}>
          Add key
        </button>
      ) : (
        <button type="button" onClick={onForget} disabled={busy} className={`${BUTTON} ${SMALL}`}>
          Forget key
        </button>
      )}
    </span>
  );
}
