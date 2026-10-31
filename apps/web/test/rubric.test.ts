// The rubric score card's numbers (pre-audit M2, P17j JU4; verifier-phase-P17i-JU4JU11-1 S1-S3,
// m3): the score is grade.ts score() (unknown items left out); the note says unknown judge items
// are not counted, with the two scores the unknown penalties allow; the total leaves unknown items
// out of the possible points, and says when the score is clipped to 0.
import { describe, expect, it } from 'vitest';
import { score, type CheckResult } from '../../../packages/grader/grade.ts';
import { rubricMark, rubricScore, rubricTotal, scoreNote, totalText } from '../src/trial/rubric.ts';

const item = (id: string, points: number, met: boolean | 'unknown', method = 'judge') => ({ id, kind: 'rubric' as const, method, points, met });
const gate = (id: string, met: boolean) => ({ id, kind: 'gate' as const, method: 'code', points: null, met });

const CASES = [
  [item('a', 2, true), item('b', 2, false), item('c', 3, 'unknown')],
  [item('a', 3, true), item('b', 4, 'unknown')],
  [item('a', 2, true), item('p', -5, true), item('q', -3, false)],
  [item('a', 2, true), item('b', 2, true), item('p', -5, 'unknown')],
  [item('a', 3, false), item('p', -5, true)],
  [item('p', -5, true)],
];

describe('rubricScore', () => {
  it('is grade.ts score() on every case', () => {
    for (const rows of CASES) expect(rubricScore(rows)).toBe(score(rows as unknown as CheckResult[]));
  });
});

describe('scoreNote', () => {
  it('is absent with every judge item answered', () => {
    expect(scoreNote([gate('g', true), item('a', 2, true)])).toBeUndefined();
  });
  it('says an unknown positive item is not counted, and makes no upper-bound claim', () => {
    expect(scoreNote(CASES[0]!)).toBe('1 judge item unknown and not counted');
  });
  it('gives the scores with the unknown penalties fired and not fired', () => {
    const rows = CASES[3]!;
    const fired = score(rows.map((r) => (r.met === 'unknown' ? { ...r, met: true } : r)) as unknown as CheckResult[])!;
    const not = score(rows.map((r) => (r.met === 'unknown' ? { ...r, met: false } : r)) as unknown as CheckResult[])!;
    expect(scoreNote(rows)).toBe(`1 judge item unknown and not counted; ${fired.toFixed(2)} if the unknown penalty fired, ${not.toFixed(2)} if not`);
  });
  it('counts unknown items in the checks it is given (the current grade), gates included', () => {
    const rows = [{ ...gate('g', true), method: 'judge', met: 'unknown' }, item('b', 4, 'unknown')];
    expect(scoreNote(rows)).toBe('2 judge items unknown and not counted');
  });
});

describe('rubricTotal and totalText', () => {
  it('leaves unknown items out of the possible points, and names them', () => {
    const t = rubricTotal(CASES[1]!);
    expect(t).toEqual({ earned: 3, possible: 3, unknown: 1 });
    expect(totalText(t)).toBe('3 of 3 points (1 unknown item not counted)');
  });
  it('counts met penalties against the positive items', () => {
    expect(totalText(rubricTotal(CASES[2]!))).toBe('-3 of 2 points (score clipped to 0)');
    expect(totalText(rubricTotal([item('a', 2, true), item('b', 3, true), item('p', -1, true)]))).toBe('4 of 5 points');
  });
  it('says the score is clipped when the penalties outweigh the met items', () => {
    expect(totalText(rubricTotal(CASES[4]!))).toBe('-5 of 3 points (score clipped to 0)');
  });
});

// verifier-phase-P17i-UI-3-1 F3: a penalty that fired has its own mark, never the check of a met item.
describe('rubricMark', () => {
  it('marks met, not met, a penalty not triggered, a fired penalty and judge unsure apart', () => {
    expect(rubricMark(item('a', 2, true))).toBe('met');
    expect(rubricMark(item('a', 2, false))).toBe('not-met');
    expect(rubricMark(item('p', -5, false))).toBe('not-triggered');
    expect(rubricMark(item('p', -5, true))).toBe('fired');
    expect(rubricMark(item('p', -5, 'unknown'))).toBe('unsure');
  });
});
