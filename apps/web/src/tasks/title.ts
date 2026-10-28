// A task title without its policy codes (pre-audit U10, P17j JU12 part 2): a trailing "under <id>"
// (or "under <id> and <id>") whose ids are policies of the task leaves the title, and every policy
// id of the task goes on the card's meta line. A title whose "under ..." names no policy keeps it.
export function titleParts(title: string, policies: readonly string[]): { title: string; codes: string[] } {
  const m = / under ((?:[A-Z][A-Z0-9-]+)(?:(?:, | and )[A-Z][A-Z0-9-]+)*)$/.exec(title);
  const named = m === null ? [] : m[1]!.split(/, | and /);
  const strip = m !== null && named.every((id) => policies.includes(id));
  return { title: strip ? title.slice(0, m!.index) : title, codes: [...policies] };
}

// The title every view shows for a task: the Tasks card, the Overview task list and the trial
// heading (verifier-phase-P17j-retro-JU12-1 D1).
export const taskTitle = (t: { title: string; policies: ReadonlyArray<{ id: string }> }): string => titleParts(t.title, t.policies.map((p) => p.id)).title;

// The Overview meta line's policies: the count, then the codes the title no longer carries.
export const policyLine = (codes: readonly string[]): string => `${codes.length} ${codes.length === 1 ? 'policy' : 'policies'}${codes.length > 0 ? `: ${codes.join(', ')}` : ''}`;
