import { describe, expect, it } from 'vitest';
import { isOutOfView, isScrollKey, isScrollbarPointer, type KeyTarget } from './follow-rules';

describe('isScrollKey', () => {
  it.each<[string, KeyTarget, boolean]>([
    ['PageDown', 'other', true],
    ['PageUp', 'control', true],
    ['PageDown', 'editable', false],
    ['ArrowDown', 'other', true],
    ['ArrowUp', 'other', true],
    ['Home', 'other', true],
    ['End', 'other', true],
    [' ', 'other', true],
    ['ArrowDown', 'control', false],
    ['Home', 'control', false],
    [' ', 'control', false],
    ['ArrowDown', 'editable', false],
    ['ArrowRight', 'other', false],
    ['Enter', 'other', false],
    ['f', 'other', false],
  ])('%j on %s scrolls: %s', (key, target, expected) => {
    expect(isScrollKey(key, target)).toBe(expected);
  });
});

describe('isScrollbarPointer', () => {
  it.each([
    [
      'in a classic scrollbar',
      { onScroller: true, offsetX: 805, clientWidth: 800, offsetWidth: 815 },
      true,
    ],
    [
      'on the content beside it',
      { onScroller: true, offsetX: 700, clientWidth: 800, offsetWidth: 815 },
      false,
    ],
    [
      'in the strip of an overlay scrollbar',
      { onScroller: true, offsetX: 790, clientWidth: 800, offsetWidth: 800 },
      true,
    ],
    [
      'left of that strip',
      { onScroller: true, offsetX: 780, clientWidth: 800, offsetWidth: 800 },
      false,
    ],
    [
      'on a child of the scroller',
      { onScroller: false, offsetX: 805, clientWidth: 800, offsetWidth: 815 },
      false,
    ],
  ])('counts a pointer %s: %s', (_case, pointer, expected) => {
    expect(isScrollbarPointer(pointer)).toBe(expected);
  });
});

describe('isOutOfView', () => {
  const viewport = { top: 0, bottom: 600 };
  const bars = { top: 104, bottom: 32 };

  it.each([
    ['in view', { top: 200, bottom: 260 }, false],
    ['hidden behind the sticky bars', { top: 40, bottom: 100 }, true],
    ['partly below the bars', { top: 50, bottom: 120 }, false],
    ['below, behind the bottom padding', { top: 568, bottom: 640 }, true],
    ['partly visible at the bottom', { top: 560, bottom: 640 }, false],
    ['far above', { top: -400, bottom: -340 }, true],
    ['far below', { top: 1200, bottom: 1260 }, true],
  ])('says a turn %s is out of view: %s', (_case, item, expected) => {
    expect(isOutOfView(item, viewport, bars)).toBe(expected);
  });

  it('never calls anything out of view in an unmeasured viewport', () => {
    expect(isOutOfView({ top: 0, bottom: 0 }, { top: 0, bottom: 0 }, bars)).toBe(false);
  });
});
