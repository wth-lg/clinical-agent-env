// The browser TaskSource: every tasks/*/task.toml, bundled by Vite's import.meta.glob with each
// task directory's files as text. Test mode, in which `all` also returns _-prefixed
// directories, is Vite's test mode. A task's events.ts is bundled twice, as text (hashed into its
// env_version) and as the module the trial runs (TaskFiles.events), from the same file.
import { taskSource, type EventsModule, type TaskFiles, type TaskSource } from '../../../../packages/core/tasks.ts';

const FILES = import.meta.glob<string>('../../../../tasks/**/*', { query: '?raw', import: 'default', eager: true });
const EVENTS = import.meta.glob<EventsModule>('../../../../tasks/*/events.ts', { eager: true });

// Every bundled task directory, as TaskFiles, each events.ts with its module.
export function browserTaskDirs(): TaskFiles[] {
  const dirs = new Map<string, Record<string, string>>();
  for (const [path, text] of Object.entries(FILES)) {
    const m = /\/tasks\/([^/]+)\/(.+)$/.exec(path);
    if (!m) continue;
    const [, id, rel] = m as unknown as [string, string, string];
    if (!dirs.has(id)) dirs.set(id, {});
    dirs.get(id)![rel] = text;
  }
  const modules = new Map(Object.entries(EVENTS).flatMap(([path, m]) => {
    const id = /\/tasks\/([^/]+)\/events\.ts$/.exec(path)?.[1];
    return id === undefined ? [] : [[id, m] as const];
  }));
  return [...dirs].map(([id, files]) => {
    const events = modules.get(id);
    return events === undefined ? { id, files } : { id, files, events };
  });
}

export function browserTaskSource(opts: { testMode?: boolean } = {}): TaskSource {
  return taskSource(async () => browserTaskDirs(), { testMode: opts.testMode ?? import.meta.env.MODE === 'test' });
}
