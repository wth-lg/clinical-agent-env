// The Node TaskSource: every tasks/*/task.toml under the repo (or `root`), read with fs. Test
// mode, in which `all` also returns _-prefixed directories, is on under vitest unless the
// caller says otherwise. A task's events.ts is also imported as a module (nodeTaskEvents), keyed by
// a hash of the text read, so a server that builds a TaskSource per request (apps/runner) runs the
// events.ts it hashed, never a stale import of an earlier text.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { taskSource, type EventsModule, type TaskFiles, type TaskSource } from '../../packages/core/tasks.ts';

export const TASKS_DIR = fileURLToPath(new URL('../../tasks/', import.meta.url));

export const isTestMode = (env: Record<string, string | undefined> = process.env): boolean => env.VITEST === 'true' || env.NODE_ENV === 'test';

// Every task directory under root, as TaskFiles.
export function nodeTaskDirs(root: string = TASKS_DIR): TaskFiles[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(root, e.name, 'task.toml')))
    .map((e) => {
      const dir = join(root, e.name);
      const files: Record<string, string> = {};
      for (const f of readdirSync(dir, { recursive: true, withFileTypes: true })) {
        if (!f.isFile()) continue;
        const abs = join(f.parentPath, f.name);
        files[relative(dir, abs).split(sep).join('/')] = readFileSync(abs, 'utf8');
      }
      return { id: e.name, files };
    });
}

// The task directories with each events.ts imported as the module the read text is.
export async function nodeTaskEvents(dirs: readonly TaskFiles[], root: string = TASKS_DIR): Promise<TaskFiles[]> {
  return Promise.all(dirs.map(async (d) => {
    const text = d.files['events.ts'];
    if (text === undefined) return d;
    const url = `${pathToFileURL(join(root, d.id, 'events.ts')).href}?sha256=${createHash('sha256').update(text).digest('hex')}`;
    const events = (await import(url)) as EventsModule;
    return { ...d, events };
  }));
}

export function nodeTaskSource(opts: { root?: string; testMode?: boolean } = {}): TaskSource {
  const root = opts.root ?? TASKS_DIR;
  return taskSource(async () => nodeTaskEvents(nodeTaskDirs(root), root), { testMode: opts.testMode ?? isTestMode() });
}
