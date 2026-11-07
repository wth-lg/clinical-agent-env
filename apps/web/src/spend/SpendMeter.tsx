import { useSessionSpend } from './session.ts';

const usd = (v: number) => `$${v.toFixed(2)}`;

// Session spend against the cap, in the top bar: "Session spend $a of $b cap" (ui-contract U15),
// so the line says what it is and what the second amount is.
export function SpendMeter() {
  const { cap, spent } = useSessionSpend();
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-ink-muted" title="Session spend against the session cap">
      <span data-testid="spend-meter">
        Session spend <span className="text-ink">{usd(spent)}</span> of {usd(cap)} cap
      </span>
      <progress
        aria-label="Session spend"
        max={cap}
        value={Math.min(spent, cap)}
        className="h-1 w-16 appearance-none overflow-hidden rounded-full bg-line [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-accent"
      />
    </span>
  );
}
