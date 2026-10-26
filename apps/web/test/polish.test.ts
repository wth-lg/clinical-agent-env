// Top bar and polish (pre-audit U10, P17j JU12): the pinned clock in words, a tool description's
// first sentence for its row, and the local key-format check the gate runs before any call.
import { describe, expect, it } from 'vitest';
import { formatClock, firstSentence } from '../src/data/text.ts';
import { describeFailure, keyFormatProblem } from '../src/keygate/failure.ts';

describe('formatClock', () => {
  it('reads an ISO time with its own offset, not the viewer\'s zone', () => {
    expect(formatClock('2026-10-23T08:00:00-04:00')).toBe('Fri 23 Oct 2026, 08:00 (UTC−4)');
    expect(formatClock('2026-01-04T17:30:00+05:30')).toBe('Sun 4 Jan 2026, 17:30 (UTC+5:30)');
    expect(formatClock('2026-03-01T00:05:00Z')).toBe('Sun 1 Mar 2026, 00:05 (UTC)');
  });
  it('leaves a value it cannot read as it is', () => {
    expect(formatClock('soon')).toBe('soon');
  });
});

describe('firstSentence', () => {
  it('is the text up to the first sentence end', () => {
    expect(firstSentence('Search FHIR resources by type. Returns rows. Use it first.')).toBe('Search FHIR resources by type.');
    expect(firstSentence('Read one resource by id, e.g. Patient/pt-1. Then more.')).toBe('Read one resource by id, e.g. Patient/pt-1.');
    expect(firstSentence('No end mark')).toBe('No end mark');
  });
});

describe('the key format check', () => {
  it('passes a key that starts with sk-ant- and stops anything else before a call', () => {
    expect(keyFormatProblem('sk-ant-api03-abc')).toBeNull();
    expect(keyFormatProblem('not-a-key')).toEqual({ kind: 'format', message: 'not-a-key does not start with sk-ant-'.replace('not-a-key', 'The key') });
    expect(keyFormatProblem(' sk-ant-x')).not.toBeNull();
  });
  it('says what an Anthropic key looks like and what to do', () => {
    expect(describeFailure({ kind: 'format', message: 'The key does not start with sk-ant-' })).toEqual({ lead: 'An Anthropic key starts with sk-ant-.', next: 'Check the key and paste it again.', local: false });
  });
});
