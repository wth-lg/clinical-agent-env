// A link to the Live trial view opens it fresh, as a rail link does: every VIEW_STATE value of the
// page left behind (task, label, check, audit, trial, run, tab) goes, except the task it selects
// (verifier-phase-P17j-retro-JU5-103-1 D2). The patch comes from VIEW_STATE, so a key added there
// is cleared here too.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hrefWith } from '../data/url.ts';
import { freshView, VIEW_STATE } from './views.ts';

const SRC = join(import.meta.dirname, '..');
const FROM = '/clinical-agent-env/?view=tasks&task=renal-dose-review&label=model&check=urgent_item_unnotified&audit=grader&trial=x&run=sample-1&tab=prompt';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [p] : [];
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('links to the Live trial view', () => {
  it('drop every VIEW_STATE value, check and audit included', () => {
    vi.stubGlobal('location', new URL(FROM, 'https://example.test'));
    expect(hrefWith(freshView('live'))).toBe('/clinical-agent-env/?view=live');
  });

  it('keep only the task Run trial selects', () => {
    vi.stubGlobal('location', new URL(FROM, 'https://example.test'));
    expect(hrefWith(freshView('live', { task: 'crc-care-gap' }))).toBe('/clinical-agent-env/?view=live&task=crc-care-gap');
  });

  it('null every VIEW_STATE key', () => {
    const patch = freshView('live');
    for (const k of VIEW_STATE) expect(patch[k], k).toBeNull();
  });

  it('are built with freshView, not a hand-listed patch', () => {
    const hits = files(SRC).flatMap((f) =>
      readFileSync(f, 'utf8').split('\n').flatMap((line, i) => (/view:\s*'live'/.test(line) ? [`${relative(SRC, f)}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(hits, "Use freshView('live', ...) from apps/web/src/shell/views.ts").toEqual([]);
  });
});
