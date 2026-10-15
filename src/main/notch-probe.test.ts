import { describe, expect, it, vi } from 'vitest';
import type { DisplayInfo } from './island-geometry';
import { appKitToElectron, createNotchProbe, notchesOf, parseProbe } from './notch-probe';

// Output of the probe on the owner's Mac (prototype PC), AppKit coordinates.
const measured = [
  {
    frame: { x: 0, y: 0, width: 1800, height: 1169 },
    safeTop: 38,
    left: { x: 0, y: 1131, width: 790, height: 38 },
    right: { x: 1010, y: 1131, width: 790, height: 38 },
  },
  {
    frame: { x: -61, y: 1169, width: 1920, height: 1080 },
    safeTop: 0,
    left: { x: 0, y: 0, width: 0, height: 0 },
    right: { x: 0, y: 0, width: 0, height: 0 },
  },
];

const retina: DisplayInfo = {
  id: 11,
  bounds: { x: 0, y: 0, width: 1800, height: 1169 },
  workArea: { x: 0, y: 38, width: 1800, height: 1069 },
  internal: true,
};
const hp: DisplayInfo = {
  id: 22,
  bounds: { x: -61, y: -1080, width: 1920, height: 1080 },
  workArea: { x: -61, y: -1055, width: 1920, height: 1055 },
  internal: false,
};

describe('appKitToElectron', () => {
  it('flips the origin from the bottom left of the main screen to its top left', () => {
    expect(appKitToElectron(measured[0]!.left, 1169)).toEqual({
      x: 0,
      y: 0,
      width: 790,
      height: 38,
    });
    expect(appKitToElectron(measured[1]!.frame, 1169)).toEqual({
      x: -61,
      y: -1080,
      width: 1920,
      height: 1080,
    });
  });

  it('leaves the main screen at the origin', () => {
    expect(appKitToElectron(measured[0]!.frame, 1169)).toEqual(retina.bounds);
  });
});

describe('parseProbe', () => {
  it('reads the measured output', () => {
    expect(parseProbe(JSON.stringify(measured))).toEqual(measured);
  });

  it('accepts a macOS without auxiliary areas', () => {
    const old = [{ ...measured[0], left: null, right: null }];
    expect(parseProbe(JSON.stringify(old))[0]?.left).toBeNull();
  });

  it.each([
    'not json',
    '[]',
    '{}',
    JSON.stringify([{ frame: { x: 0, y: 0, width: 'wide', height: 1 }, safeTop: 0 }]),
    JSON.stringify([{ ...measured[0], safeTop: -3 }]),
    JSON.stringify([{ ...measured[0], frame: { x: 0, y: 0, width: -1, height: 2 } }]),
    JSON.stringify(Array.from({ length: 17 }, () => measured[1])),
  ])('refuses %s', (output) => {
    expect(() => parseProbe(output)).toThrow();
  });
});

describe('notchesOf', () => {
  it('finds the 220 × 38 pt notch of the built-in screen and none on the external one', () => {
    const notches = notchesOf([retina, hp], measured);
    expect([...notches]).toEqual([[11, { x: 790, width: 220, height: 38 }]]);
  });

  // AppKit documents the auxiliary areas in global screen coordinates.
  it('keeps the notch in global coordinates for a built-in screen away from the origin', () => {
    const external = { ...measured[1]!, frame: { x: 0, y: 0, width: 1920, height: 1080 } };
    const builtIn = {
      ...measured[0]!,
      frame: { x: 1920, y: 0, width: 1800, height: 1169 },
      left: { x: 1920, y: 1131, width: 790, height: 38 },
      right: { x: 2930, y: 1131, width: 790, height: 38 },
    };
    const right: DisplayInfo = {
      ...retina,
      bounds: { x: 1920, y: -89, width: 1800, height: 1169 },
    };
    const notches = notchesOf([right], [external, builtIn]);
    expect(notches.get(11)).toEqual({ x: 2710, width: 220, height: 38 });
  });

  it('moves areas given relative to their screen into global coordinates', () => {
    const builtIn = {
      ...measured[0]!,
      frame: { x: 1920, y: 0, width: 1800, height: 1169 },
    };
    const right: DisplayInfo = { ...retina, bounds: { x: 1920, y: 0, width: 1800, height: 1169 } };
    expect(notchesOf([right], [builtIn]).get(11)).toEqual({ x: 2710, width: 220, height: 38 });
  });

  it('ignores a probed screen that matches no display', () => {
    expect(notchesOf([hp], measured).size).toBe(0);
  });
});

describe('createNotchProbe', () => {
  it('runs osascript once and serves the cache until the screens change', async () => {
    const run = vi.fn(async () => JSON.stringify(measured));
    const probe = createNotchProbe(run);
    expect(await probe.read()).toEqual(measured);
    expect(await probe.read()).toEqual(measured);
    expect(run).toHaveBeenCalledOnce();
    probe.invalidate();
    await probe.read();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['fails', () => Promise.reject(new Error('osascript: timeout'))],
    ['answers nonsense', () => Promise.resolve('[{"frame":1}]')],
  ])('reports nothing when osascript %s, and asks again next time', async (_case, failing) => {
    const run = vi.fn(failing);
    const probe = createNotchProbe(run);
    expect(await probe.read()).toBeNull();
    run.mockResolvedValueOnce(JSON.stringify(measured));
    expect(await probe.read()).toEqual(measured);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
