import { execFile } from 'node:child_process';
import { z } from 'zod';
import type { DisplayInfo, NotchArea, Rect } from './island-geometry';

// Electron exposes neither the safe area nor the notch: AppKit is asked through JXA.
const PROBE_SCRIPT = `
ObjC.import('AppKit');
const screens = $.NSScreen.screens;
const rect = (r) => ({ x: r.origin.x, y: r.origin.y, width: r.size.width, height: r.size.height });
const out = [];
for (let i = 0; i < screens.count; i++) {
  const s = screens.objectAtIndex(i);
  const aux = typeof s.auxiliaryTopLeftArea !== 'undefined';
  out.push({
    frame: rect(s.frame),
    safeTop: s.safeAreaInsets.top,
    left: aux ? rect(s.auxiliaryTopLeftArea) : null,
    right: aux ? rect(s.auxiliaryTopRightArea) : null,
  });
}
JSON.stringify(out);
`;
// Measured at 0.13 s; beyond this the island falls back to the menu bar.
const PROBE_TIMEOUT = 2_000;
const MATCH_TOLERANCE = 1;

const rectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().min(0),
  height: z.number().finite().min(0),
});

const probeSchema = z
  .array(
    z.object({
      frame: rectSchema,
      safeTop: z.number().finite().min(0),
      left: rectSchema.nullable(),
      right: rectSchema.nullable(),
    }),
  )
  .min(1)
  .max(16);

/** One `NSScreen`, origin at the bottom left of the main screen; the first is the main one. */
export type ProbedScreen = z.infer<typeof probeSchema>[number];

export function parseProbe(output: string): ProbedScreen[] {
  return probeSchema.parse(JSON.parse(output));
}

export function appKitToElectron(rect: Rect, mainHeight: number): Rect {
  return { ...rect, y: mainHeight - (rect.y + rect.height) };
}

function sameRect(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) <= MATCH_TOLERANCE &&
    Math.abs(a.y - b.y) <= MATCH_TOLERANCE &&
    Math.abs(a.width - b.width) <= MATCH_TOLERANCE &&
    Math.abs(a.height - b.height) <= MATCH_TOLERANCE
  );
}

function notchOf({ left, right }: ProbedScreen): NotchArea | null {
  if (!left || !right || left.width === 0 || right.width === 0) return null;
  const start = left.x + left.width;
  if (right.x <= start) return null;
  return { x: start, width: right.x - start, height: left.height };
}

/** Notches by Electron display id, screens matched on their frame. */
export function notchesOf(
  displays: readonly DisplayInfo[],
  screens: readonly ProbedScreen[],
): Map<number, NotchArea> {
  const mainHeight = screens[0]?.frame.height ?? 0;
  const notches = new Map<number, NotchArea>();
  for (const screen of screens) {
    const notch = notchOf(screen);
    const frame = appKitToElectron(screen.frame, mainHeight);
    const display = displays.find((candidate) => sameRect(candidate.bounds, frame));
    if (notch && display) notches.set(display.id, notch);
  }
  return notches;
}

function runOsascript(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'osascript',
      ['-l', 'JavaScript', '-e', PROBE_SCRIPT],
      { timeout: PROBE_TIMEOUT, encoding: 'utf8' },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

export interface NotchProbe {
  /** The screens as AppKit sees them, or null when the probe failed. */
  read(): Promise<ProbedScreen[] | null>;
  /** Screens changed: the next read asks AppKit again. */
  invalidate(): void;
}

export function createNotchProbe(run: () => Promise<string> = runOsascript): NotchProbe {
  let cached: Promise<ProbedScreen[] | null> | undefined;
  return {
    read() {
      cached ??= run()
        .then(parseProbe)
        .catch(() => null);
      return cached;
    },
    invalidate() {
      cached = undefined;
    },
  };
}
