import { describe, expect, it } from 'vitest';
import {
  contains,
  islandLayout,
  reachOf,
  type DisplayInfo,
  type NotchArea,
} from './island-geometry';

// Measured on the owner's Mac (prototype PC), in Electron coordinates.
const retina: DisplayInfo = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1800, height: 1169 },
  workArea: { x: 0, y: 38, width: 1800, height: 1069 },
  internal: true,
};
const retinaNotch: NotchArea = { x: 790, width: 220, height: 38 };
// « HP 524pf », above the Retina screen: AppKit (−61, 1169) is Electron (−61, −1080).
const hp: DisplayInfo = {
  id: 2,
  bounds: { x: -61, y: -1080, width: 1920, height: 1080 },
  workArea: { x: -61, y: -1055, width: 1920, height: 1055 },
  internal: false,
};
const wide: DisplayInfo = {
  id: 3,
  bounds: { x: 1800, y: 0, width: 2560, height: 1440 },
  workArea: { x: 1800, y: 25, width: 2560, height: 1415 },
  internal: false,
};

const notches = (entries: [number, NotchArea][] = []) => new Map(entries);

describe('islandLayout with a known notch', () => {
  const layout = islandLayout({
    displays: [retina, hp],
    primaryId: 1,
    notches: notches([[1, retinaNotch]]),
  });

  it('hangs from the top of the notched screen, centred on the notch', () => {
    expect(layout?.displayId).toBe(1);
    expect(layout?.window).toEqual({ x: 600, y: 0, width: 600, height: 280 });
  });

  it('spreads an 84 pt wing on each side of the notch, as tall as the notch', () => {
    expect(layout?.compact).toEqual({ x: 706, y: 0, width: 388, height: 38 });
    expect(layout?.shape).toEqual({
      kind: 'notch',
      barHeight: 38,
      notchWidth: 220,
      compactWidth: 388,
      openWidth: 560,
      openHeight: 240,
    });
  });

  it('opens downwards inside the window', () => {
    expect(layout?.open).toEqual({ x: 620, y: 0, width: 560, height: 240 });
  });

  it('prefers the notched screen even when an external screen is the main one', () => {
    const other = islandLayout({
      displays: [retina, hp],
      primaryId: 2,
      notches: notches([[1, retinaNotch]]),
    });
    expect(other?.displayId).toBe(1);
    expect(other?.shape.kind).toBe('notch');
  });

  it('keeps the notch shape when the menu bar hides itself', () => {
    const hidden = { ...retina, workArea: { ...retina.bounds } };
    const result = islandLayout({
      displays: [hidden],
      primaryId: 1,
      notches: notches([[1, retinaNotch]]),
    });
    expect(result?.compact).toEqual({ x: 706, y: 0, width: 388, height: 38 });
  });
});

describe('islandLayout without a notch', () => {
  it('centres a pill at the top of the main screen, as tall as its menu bar', () => {
    const layout = islandLayout({ displays: [hp], primaryId: 2, notches: notches() });
    expect(layout?.displayId).toBe(2);
    expect(layout?.shape).toMatchObject({ kind: 'pill', barHeight: 25, notchWidth: 0 });
    expect(layout?.compact).toEqual({ x: 815, y: -1080, width: 168, height: 25 });
    expect(layout?.window).toEqual({ x: 599, y: -1080, width: 600, height: 280 });
  });

  it('does the same on a 2560 × 1440 external screen', () => {
    const layout = islandLayout({ displays: [retina, wide], primaryId: 3, notches: notches() });
    expect(layout?.displayId).toBe(3);
    expect(layout?.compact).toEqual({ x: 2996, y: 0, width: 168, height: 25 });
  });

  it('keeps a readable height when the menu bar hides itself', () => {
    const hidden = { ...hp, workArea: { ...hp.bounds } };
    const layout = islandLayout({ displays: [hidden], primaryId: 2, notches: notches() });
    expect(layout?.compact).toEqual({ x: 815, y: -1080, width: 168, height: 32 });
    expect(layout?.shape.kind).toBe('pill');
  });
});

describe('islandLayout when the probe failed', () => {
  it('sits under a tall menu bar of the built-in screen, where a notch is likely', () => {
    const layout = islandLayout({ displays: [retina, hp], primaryId: 1, notches: null });
    expect(layout?.shape.kind).toBe('below-bar');
    expect(layout?.compact).toEqual({ x: 816, y: 38, width: 168, height: 32 });
    expect(layout?.window.y).toBe(38);
  });

  it('falls back to the top pill on an external main screen', () => {
    const layout = islandLayout({ displays: [retina, hp], primaryId: 2, notches: null });
    expect(layout?.displayId).toBe(2);
    expect(layout?.shape.kind).toBe('pill');
  });

  it('falls back to the top pill under a short menu bar', () => {
    const older = { ...retina, workArea: { ...retina.workArea, y: 24 } };
    const layout = islandLayout({ displays: [older], primaryId: 1, notches: null });
    expect(layout?.shape.kind).toBe('pill');
    expect(layout?.compact.y).toBe(0);
  });
});

it('has nothing to place without a screen', () => {
  expect(islandLayout({ displays: [], primaryId: 1, notches: null })).toBeNull();
});

it('tells whether a point lies in a rectangle, edges included', () => {
  const rect = { x: 10, y: 0, width: 20, height: 10 };
  expect(contains(rect, { x: 10, y: 0 })).toBe(true);
  expect(contains(rect, { x: 30, y: 10 })).toBe(true);
  expect(contains(rect, { x: 31, y: 5 })).toBe(false);
  expect(contains(rect, { x: 15, y: -1 })).toBe(false);
});

describe('reachOf', () => {
  it('takes the wings and 8 pt to the sides and below, never more', () => {
    const compact = { x: 706, y: 0, width: 388, height: 38 };
    const reach = reachOf(compact);
    expect(reach).toEqual({ x: 698, y: 0, width: 404, height: 46 });
    expect(contains(reach, { x: 699, y: 45 })).toBe(true);
    expect(contains(reach, { x: 697, y: 10 })).toBe(false);
    expect(contains(reach, { x: 900, y: 47 })).toBe(false);
  });
});
