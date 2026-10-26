// The WAI-ARIA tab keys shared by the task and trial tab strips: ArrowRight and ArrowLeft move to
// the next and previous tab and wrap at the ends, Home and End go to the first and last tab, and
// any other key leaves the selection alone.
import { describe, expect, it } from 'vitest';
import { tabTarget } from '../src/data/tabs.ts';

describe('tabTarget', () => {
  it('moves right and left with wrap, Home and End to the ends', () => {
    expect(tabTarget('ArrowRight', 0, 5)).toBe(1);
    expect(tabTarget('ArrowRight', 4, 5)).toBe(0);
    expect(tabTarget('ArrowLeft', 0, 5)).toBe(4);
    expect(tabTarget('ArrowLeft', 3, 5)).toBe(2);
    expect(tabTarget('Home', 3, 5)).toBe(0);
    expect(tabTarget('End', 1, 5)).toBe(4);
  });

  it('ignores other keys', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'a', 'Tab']) expect(tabTarget(key, 2, 5)).toBeNull();
  });
});
