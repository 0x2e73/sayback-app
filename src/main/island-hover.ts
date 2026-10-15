import { contains, reachOf, type Point, type Rect } from './island-geometry';

export interface HoverArea {
  /** Where the cursor keeps an open island open. */
  open: Rect;
  /** Where a closed island takes a click: its wings and a margin around them. */
  reach: Rect;
}

export interface HoverState {
  expanded: boolean;
  /** The cursor has been in the open shell since it last opened. */
  entered?: boolean;
  /** Since when (ms) the cursor has been outside the open shell. */
  since?: number;
}

/** How long (ms) the cursor may stay outside an open island before it closes. */
export interface HoverDelays {
  /** After having been in it. */
  close: number;
  /** Without ever coming in (opened by the menu bar icon or a click). */
  untouched: number;
}

/** The recording island folds into wings soon after the cursor leaves. */
export const RECORDING_HOVER: HoverDelays = { close: 300, untouched: 15_000 };
/** The ready island closes 3 s after the cursor leaves it, 15 s if the cursor never came. */
export const READY_HOVER: HoverDelays = { close: 3_000, untouched: 15_000 };
/** An error on the ready island keeps it open at least this long (ms). */
export const READY_ERROR_HOLD = 30_000;

const POLL_INTERVAL = 50;

/**
 * Closes after a while outside the open shell. It never opens on hover: going for the menu bar
 * would open it by accident. A click opens it, through `expand`.
 */
export function nextHover(
  state: HoverState,
  cursor: Point,
  area: HoverArea,
  now: number,
  delays: HoverDelays = RECORDING_HOVER,
): HoverState {
  if (!state.expanded) return { expanded: false };
  if (contains(area.open, cursor)) return { expanded: true, entered: true };
  const since = state.since ?? now;
  const delay = state.entered ? delays.close : delays.untouched;
  if (now - since >= delay) return { expanded: false };
  return { ...state, since };
}

export interface HoverDeps {
  /** Screen point of the cursor, as `screen.getCursorScreenPoint()`. */
  cursor(): Point;
  /** Null while the island has no place on screen. */
  area(): HoverArea | null;
  onChange(expanded: boolean): void;
  /** Closed, whether the cursor is within reach of the wings; reported on each change. */
  onReach?(reachable: boolean): void;
  delays?: HoverDelays;
  /** Where it starts: closed for the recording island, open and not entered for the ready one. */
  initial?: HoverState;
  /** While true, an open island stays open and its countdown starts again afterwards. */
  hold?(): boolean;
  now?(): number;
}

interface HoverWiring {
  /** The open shell and the wings, in screen points; null while the island has no place. */
  shells(): { open: Rect; compact: Rect } | null;
  onChange(expanded: boolean): void;
  onReach(reachable: boolean): void;
  hold(): boolean;
}

/**
 * The hover of each mode: the visible shell keeps it open, never the whole transparent window;
 * the wings and a margin take a click; ready and recording close after their own delays.
 */
export function hoverFor(
  mode: 'ready' | 'recording',
  initial: HoverState,
  wiring: HoverWiring,
): Omit<HoverDeps, 'cursor' | 'now'> {
  return {
    area: () => {
      const shells = wiring.shells();
      return shells && { open: shells.open, reach: reachOf(shells.compact) };
    },
    onChange: wiring.onChange,
    onReach: wiring.onReach,
    delays: mode === 'ready' ? READY_HOVER : RECORDING_HOVER,
    initial,
    hold: wiring.hold,
  };
}

export interface IslandHover {
  /** Opens at once, as if the cursor had never come: the untouched delay applies. */
  expand(): void;
  /** Closes at once, as after the stop. */
  collapse(): void;
  stop(): void;
}

// The window lets every click through while closed, so the DOM sees no hover: the cursor is polled.
export function startIslandHover({
  cursor,
  area,
  onChange,
  onReach = () => {},
  delays = RECORDING_HOVER,
  initial = { expanded: false },
  hold = () => false,
  now = () => performance.now(),
}: HoverDeps): IslandHover {
  let state: HoverState = initial;
  let reachable = false;
  const reach = (next: boolean) => {
    if (next === reachable) return;
    reachable = next;
    onReach(next);
  };
  const tick = () => {
    const current = area();
    if (!current) return;
    const point = cursor();
    reach(!state.expanded && contains(current.reach, point));
    if (state.expanded && hold()) {
      state = { expanded: true, entered: state.entered || contains(current.open, point) };
      return;
    }
    const next = nextHover(state, point, current, now(), delays);
    const changed = next.expanded !== state.expanded;
    state = next;
    if (changed) onChange(next.expanded);
  };
  const timer = setInterval(() => {
    // A failed read skips one tick; the island keeps following the cursor.
    try {
      tick();
    } catch (error) {
      console.error('[island] hover tick failed', error);
    }
  }, POLL_INTERVAL);
  return {
    expand() {
      if (state.expanded) return;
      state = { expanded: true, entered: false };
      reach(false);
      onChange(true);
    },
    collapse() {
      if (!state.expanded) return;
      state = { expanded: false };
      onChange(false);
    },
    stop: () => clearInterval(timer),
  };
}
