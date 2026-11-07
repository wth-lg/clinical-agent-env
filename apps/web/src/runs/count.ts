// The Runs count line (P25u J9). The lead names the official run's 120 trials; this line used to
// say "365 of 365 trials", the pilots and superseded versions included, so the two numbers read
// as a contradiction. Now it leads with the official trials, the only ones the results count, and
// names the others as "more ... not counted". With a filter the official part reads
// "<shown> of <total>"; a kind with no listed trial (or hidden by the check or audit filter) is
// left out of the parenthesis. The noun follows its count ("1 official trial", "1 of 120 official
// trials", "1 trial in pilots"; gate P25U-S2 F2).
export interface ShownCount {
  // The official run's trials that match the filters, and all of them; null with no official run.
  official: { shown: number; total: number } | null;
  // The listed pilot and superseded trials that match the filters.
  pilots: number;
  superseded: number;
  filtered: boolean;
}

const where = (c: ShownCount): string => [c.pilots > 0 ? 'pilots' : null, c.superseded > 0 ? 'superseded versions' : null].filter((x) => x !== null).join(' and ');
const trials = (n: number) => (n === 1 ? 'trial' : 'trials');

export function shownCountLine(c: ShownCount): string {
  const more = c.pilots + c.superseded;
  if (c.official === null) return more === 0 ? 'Showing 0 trials' : `Showing ${more} ${trials(more)} in ${where(c)}, not counted in the results`;
  // With a filter the noun belongs to the total ("1 of 120 official trials").
  const official = c.filtered ? `Showing ${c.official.shown} of ${c.official.total} official ${trials(c.official.total)}` : `Showing ${c.official.shown} official ${trials(c.official.shown)}`;
  return more === 0 ? official : `${official} (${more} more in ${where(c)}, not counted)`;
}
