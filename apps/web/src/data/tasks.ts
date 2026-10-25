// The six tasks (prompt, tools, policies) for the views that list them: Overview and Tasks. The
// task files are a large chunk; ViewBody starts this load when the app starts, behind the key
// gate, so Overview can list the tasks with no official run. A failed load is not kept.
import { useEffect, useState } from 'react';
import type { Task } from '../../../../packages/core/tasks.ts';

let cached: Promise<Task[]> | undefined;
export function loadTaskList(): Promise<Task[]> {
  return (cached ??= import('../adapters/tasks-browser.ts')
    .then(({ browserTaskSource }) => browserTaskSource({ testMode: false }).all())
    .catch((e: unknown) => {
      cached = undefined;
      throw e;
    }));
}

export function useTaskList(): { tasks: Task[] | null; error: string | null } {
  const [state, setState] = useState<{ tasks: Task[] | null; error: string | null }>({ tasks: null, error: null });
  useEffect(() => {
    let live = true;
    loadTaskList().then(
      (tasks) => live && setState({ tasks, error: null }),
      (e: unknown) => live && setState({ tasks: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}
