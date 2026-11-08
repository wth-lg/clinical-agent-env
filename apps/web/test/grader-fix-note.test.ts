// The note beside "0 grader" on Overview and Runs (eval-p25u-2 S10): it counts the official run's
// regraded trials apart from a superseded version's, which are not counted
// (verifier-phase-P25u-decisive-1 claim 2). Rendered with the final-1 figures (findings-counts.test.ts
// reads them from the records).
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

// The root tsconfig, which checks apps/web/test, has no JSX, so the component is imported by a
// path tsc does not follow; vitest compiles it as the app does.
type Fixes = { trials: number; graders: readonly string[]; names: readonly string[] };
const PATH = '../src/findings/why.tsx';
const { GraderFixNote } = (await import(PATH)) as { GraderFixNote: (p: { counted: Fixes; superseded: ReadonlyArray<Fixes & { label: string }>; href: string | null }) => ReactNode };

const text = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'");
const counted: Fixes = { trials: 1, graders: ['22'], names: ['message-queue/10'] };
const crc = { label: 'crc-care-gap v1', trials: 12, graders: ['22'], names: [] };

describe('GraderFixNote', () => {
  it('on final-1: 1 counted trial named, the superseded version apart and not counted', () => {
    const html = renderToStaticMarkup(createElement(GraderFixNote, { counted, superseded: [crc], href: null }));
    expect(text(html)).toBe(
      'Why 0 grader: three grader faults were found in clinical reads and fixed in the grader, then the affected trials were regraded offline with no model call. In this run a regrade with grader 22 moved 1 counted trial (message-queue/10) from FAIL to PASS. The other two faults were in crc-care-gap v1, where a regrade with grader 22 moved 12 trials to PASS. That version was replaced by a changed version of the task, and only the changed version is counted.',
    );
    expect(html).toContain('data-trials="1"');
    expect(html).toContain('data-superseded-trials="12"');
  });

  it('with no superseded regrade: no superseded sentence', () => {
    const html = renderToStaticMarkup(createElement(GraderFixNote, { counted, superseded: [{ ...crc, trials: 0, graders: [] }], href: null }));
    expect(text(html)).not.toContain('superseded');
  });

  it('with no regrade at all: nothing', () => {
    expect(renderToStaticMarkup(createElement(GraderFixNote, { counted: { trials: 0, graders: [], names: [] }, superseded: [], href: null }))).toBe('');
  });
});
