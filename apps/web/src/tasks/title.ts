// A task title without its policy codes (pre-audit U10, P17j JU12 part 2): a trailing "under <id>"
// (or "under <id> and <id>") whose ids are policies of the task leaves the title, and every policy
// id of the task goes on the card's meta line. A title whose "under ..." names no policy keeps it.
export function titleParts(title: string, policies: readonly string[]): { title: string; codes: string[] } {
  const m = / under ((?:[A-Z][A-Z0-9-]+)(?:(?:, | and )[A-Z][A-Z0-9-]+)*)$/.exec(title);
  const named = m === null ? [] : m[1]!.split(/, | and /);
  const strip = m !== null && named.every((id) => policies.includes(id));
  return { title: strip ? title.slice(0, m!.index) : title, codes: [...policies] };
}
