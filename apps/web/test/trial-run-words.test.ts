// The run line of the trial header (P25u S3 A19): a session run says it is one and no more, because
// the banner above the page already says it is not in the published results.
import { describe, expect, it } from 'vitest';
import { runWords } from '../src/trial/run-words.ts';

describe('runWords', () => {
  it('names each kind of run once', () => {
    expect(runWords({ official: true, superseded: null })).toBe(', the official run');
    expect(runWords({ official: false, kind: 'session', superseded: null })).toBe(', a run from this session');
    expect(runWords({ official: false, kind: 'pilot', superseded: null })).toBe(', a pilot run, not counted in the results');
    expect(runWords({ official: false, kind: 'superseded', superseded: { version: 'v1', task: 'crc-care-gap', of: 'final-1' } })).toBe(', the superseded v1 of crc-care-gap in final-1, not counted in the results');
  });
  it('does not repeat the banner on a session run', () => {
    expect(runWords({ official: false, kind: 'session', superseded: null })).not.toContain('published');
  });
});
