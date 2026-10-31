// The question each judged or hybrid rubric item of a task asks, in words (tasks/check-text.ts
// rubricQuestion), loaded once per task: the trial header names its harm items with them, and the
// Grading rubric names each row with them (ui-polish 3.2). A code item has none.
import { useEffect, useState } from 'react';

const loaded = new Map<string, Promise<Readonly<Record<string, string>>>>();

function questionsOf(task: string): Promise<Readonly<Record<string, string>>> {
  let p = loaded.get(task);
  if (p === undefined) {
    p = Promise.all([import('../tasks/matrix-task.ts'), import('../tasks/check-text.ts')]).then(async ([{ taskChecks }, { rubricQuestion }]) => {
      const out: Record<string, string> = {};
      for (const c of await taskChecks(task).catch(() => [])) {
        const q = await rubricQuestion(c);
        if (q) out[c.id] = q;
      }
      return out;
    });
    // A failed load is not kept, so the next view tries again.
    p.catch(() => loaded.delete(task));
    loaded.set(task, p);
  }
  return p;
}

export function useRubricQuestions(task: string, enabled = true): Readonly<Record<string, string>> {
  const [questions, setQuestions] = useState<Readonly<Record<string, string>>>({});
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    questionsOf(task).then((q) => live && setQuestions(q), () => undefined);
    return () => {
      live = false;
    };
  }, [task, enabled]);
  return questions;
}
