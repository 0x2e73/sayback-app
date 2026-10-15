import type { IslandKind, IslandShape } from '../shared/island';

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
}

/** What the island needs from an Electron `Display`, in points with a top-left origin. */
export interface DisplayInfo {
  id: number;
  bounds: Rect;
  workArea: Rect;
  internal: boolean;
}

/** The camera housing at the top of a display, in screen coordinates. */
export interface NotchArea {
  x: number;
  width: number;
  height: number;
}

export interface LayoutInput {
  displays: readonly DisplayInfo[];
  primaryId: number;
  /** Notches by display id; null when the probe failed and nothing is known. */
  notches: ReadonlyMap<number, NotchArea> | null;
}

export interface IslandLayout {
  displayId: number;
  /** Fixed at the open size: only the shell drawn inside it grows. */
  window: Rect;
  /** Where the cursor opens the island. */
  compact: Rect;
  /** Where the cursor keeps it open. */
  open: Rect;
  shape: IslandShape;
}

const WINDOW = { width: 600, height: 280 };
const OPEN = { width: 560, height: 240 };
const WING = 84;
// Under this height the menu bar is hidden; the pill keeps a readable size.
const SHORTEST_BAR = 20;
const PILL_HEIGHT = 32;
// Menu bars of notched Macs are 37 to 38 pt; others are 24 to 25 pt.
const NOTCHED_BAR = 32;

export function contains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

// A few points around the wings: a click that just misses them still opens the island.
export const REACH_MARGIN = 8;

/** The closed island's clickable area: its wings and a margin to the sides and below. */
export function reachOf(compact: Rect): Rect {
  return {
    x: compact.x - REACH_MARGIN,
    y: compact.y,
    width: compact.width + 2 * REACH_MARGIN,
    height: compact.height + REACH_MARGIN,
  };
}

function topCentred(centreX: number, top: number, width: number, height: number): Rect {
  return { x: Math.round(centreX - width / 2), y: top, width, height };
}

interface Placement {
  display: DisplayInfo;
  kind: IslandKind;
  centreX: number;
  top: number;
  barHeight: number;
  notchWidth: number;
}

function barOf(display: DisplayInfo): number {
  return display.workArea.y - display.bounds.y;
}

function withoutNotch(display: DisplayInfo, probeFailed: boolean): Placement {
  const bar = barOf(display);
  const centreX = display.bounds.x + display.bounds.width / 2;
  const base = { display, centreX, notchWidth: 0 };
  if (probeFailed && display.internal && bar >= NOTCHED_BAR) {
    return { ...base, kind: 'below-bar', top: display.workArea.y, barHeight: PILL_HEIGHT };
  }
  const barHeight = bar >= SHORTEST_BAR ? bar : PILL_HEIGHT;
  return { ...base, kind: 'pill', top: display.bounds.y, barHeight };
}

function placement({ displays, primaryId, notches }: LayoutInput): Placement | null {
  const notched = displays.find((display) => notches?.has(display.id));
  const notch = notched && notches?.get(notched.id);
  if (notched && notch) {
    return {
      display: notched,
      kind: 'notch',
      centreX: notch.x + notch.width / 2,
      top: notched.bounds.y,
      barHeight: notch.height,
      notchWidth: notch.width,
    };
  }
  const primary = displays.find((display) => display.id === primaryId) ?? displays[0];
  return primary ? withoutNotch(primary, notches === null) : null;
}

/** Notched built-in screen first, otherwise the main screen. */
export function islandLayout(input: LayoutInput): IslandLayout | null {
  const place = placement(input);
  if (!place) return null;
  const compactWidth = place.notchWidth + 2 * WING;
  return {
    displayId: place.display.id,
    window: topCentred(place.centreX, place.top, WINDOW.width, WINDOW.height),
    compact: topCentred(place.centreX, place.top, compactWidth, place.barHeight),
    open: topCentred(place.centreX, place.top, OPEN.width, OPEN.height),
    shape: {
      kind: place.kind,
      barHeight: place.barHeight,
      notchWidth: place.notchWidth,
      compactWidth,
      openWidth: OPEN.width,
      openHeight: OPEN.height,
    },
  };
}
