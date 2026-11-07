import { useSessionSpend } from './session.ts';

const usd = (v: number) => `$${v.toFixed(2)}`;

// What the session has committed against the cap, in the top bar: "Committed $a of $b cap"
// (ui-contract U15). The figure holds the money reserved for running trials as well as what is
// settled, so it says committed, not spent (P25u A6: during a trial that had cost $0.00 the old
// "Session spend $7.91" read as money already spent); the title says what it includes.
export const METER_TITLE = 'Includes the most a running trial can still cost';

export function SpendMeter() {
  const { cap, spent } = useSessionSpend();
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-ink-muted" title={METER_TITLE}>
      <span data-testid="spend-meter">
        Committed <span className="text-ink">{usd(spent)}</span> of {usd(cap)} cap
      </span>
      <progress
        aria-label="Committed spend"
        max={cap}
        value={Math.min(spent, cap)}
        className="h-1 w-16 appearance-none overflow-hidden rounded-full bg-line [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-accent"
      />
    </span>
  );
}
