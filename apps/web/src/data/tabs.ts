// The WAI-ARIA tab keys: the index of the tab a key moves to from tab i of n, or null for a key
// that does not move. ArrowRight and ArrowLeft wrap at the ends; Home and End go to the ends.
export function tabTarget(key: string, i: number, n: number): number | null {
  if (key === 'ArrowRight') return (i + 1) % n;
  if (key === 'ArrowLeft') return (i + n - 1) % n;
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return null;
}
