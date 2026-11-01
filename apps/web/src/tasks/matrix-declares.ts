// task.toml's [matrix] table in the browser, apart from matrix-task.ts so that Node tests can
// import it without Vite's import.meta.glob.
import type { Declares } from '../../../../packages/grader/matrix/types.ts';

// A TOML array of strings at the start of src: one line or several, with comments, basic ("…")
// or literal ('…') strings and an optional trailing comma. Returns the strings and the length of
// src it read; throws on anything else, such as a number or a list that never closes.
function readStringList(src: string): { list: string[]; end: number } {
  const bad = () => new Error('task.toml [matrix] traps must be a list of strings');
  let i = 0;
  const skip = () => {
    for (;;) {
      const gap = /^(?:\s+|#[^\n]*)/.exec(src.slice(i));
      if (gap === null) return;
      i += gap[0].length;
    }
  };
  if (src[i] !== '[') throw bad();
  i++;
  const list: string[] = [];
  for (;;) {
    skip();
    if (src[i] === ']') return { list, end: i + 1 };
    const s = /^(?:"((?:[^"\\\n]|\\.)*)"|'([^'\n]*)')/.exec(src.slice(i));
    if (s === null) throw bad();
    list.push(s[2] ?? (JSON.parse(`"${s[1]!}"`) as string));
    i += s[0].length;
    skip();
    if (src[i] === ',') i++;
    else if (src[i] !== ']') throw bad();
  }
}

// task.toml's [matrix] table, read the way declaresOf (packages/grader/matrix/matrix.ts) reads it:
// traps, a list of strings on one line or several, and status_only. The TOML parser is not a web
// dependency, so this reads only those forms and throws on anything else in the table, so a task
// written another way fails here instead of being read wrong. apps/web/test/matrix-declares.test.ts
// holds every committed task.toml to the CLI's reading.
export function matrixDeclares(toml: string): Declares {
  let traps: string[] = [];
  let status_only = false;
  let inMatrix = false;
  const lines = toml.split('\n');
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n]!.replace(/\s+#.*$/, '').trim();
    if (line.startsWith('[')) {
      inMatrix = line === '[matrix]';
      continue;
    }
    if (!inMatrix || line === '' || line.startsWith('#')) continue;
    const m = /^(traps|status_only)\s*=\s*(.+)$/.exec(line);
    if (m?.[1] === 'traps') {
      // The list may run over the lines after this one; read from the raw text after '='.
      const rest = [lines[n]!.slice(lines[n]!.indexOf('=') + 1).trimStart(), ...lines.slice(n + 1)].join('\n');
      const { list, end } = readStringList(rest);
      const nl = rest.indexOf('\n', end);
      if (!/^\s*(?:#.*)?$/.test(rest.slice(end, nl === -1 ? undefined : nl))) throw new Error('task.toml [matrix] traps must be a list of strings');
      traps = list;
      n += rest.slice(0, end).split('\n').length - 1;
    } else if (m?.[1] === 'status_only' && (m[2] === 'true' || m[2] === 'false')) status_only = m[2] === 'true';
    else throw new Error(`task.toml [matrix]: cannot read ${JSON.stringify(line)} in the browser`);
  }
  return { traps, status_only };
}
