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

// A plain name for each task the task list leaves out (ids that start with _), so the live launcher
// never shows a bare id (ui-polish 5.1). The name lives here, not in the task's task.toml, so no
// task file and no task version changes.
const UNLISTED_TITLES: Readonly<Record<string, string>> = { _toy: 'Practice task (write one note)' };

// The title the live launcher and its headings show for a task id: from the task list, else the
// unlisted name, else the id itself.
export function liveTaskTitle(id: string, tasks: ReadonlyArray<{ id: string; title: string; policies: ReadonlyArray<{ id: string }> }> | null): string {
  const t = tasks?.find((x) => x.id === id);
  return t ? taskTitle(t) : (UNLISTED_TITLES[id] ?? id);
}
