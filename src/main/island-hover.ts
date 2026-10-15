import { contains, type Point, type Rect } from './island-geometry';

export interface HoverArea {
  compact: Rect;
  open: Rect;
}

export interface HoverState {
  expanded: boolean;
  /** The cursor has been in the open shell since it last opened. */
  entered?: boolean;
  /** Since when (ms) the cursor has been where it asks for the other state. */
  since?: number;
}

/** How long (ms) the cursor must stay where it asks for the other state. */
export interface HoverDelays {
  /** Resting in the compact shell before it opens. */
  open: number;
  /** Outside the open shell, after having been in it, before it closes. */
  close: number;
  /** Open without the cursor ever coming in (opened by the menu bar icon), before it closes. */
  untouched: number;
}

/** The recording island folds into wings soon after the cursor leaves. */
export const RECORDING_HOVER: HoverDelays = { open: 120, close: 300, untouched: 15_000 };
/** The ready island closes 3 s after the cursor leaves it, 15 s if the cursor never came. */
export const READY_HOVER: HoverDelays = { open: 120, close: 3_000, untouched: 15_000 };
/** An error on the ready island keeps it open at least this long (ms). */
export const READY_ERROR_HOLD = 30_000;

const POLL_INTERVAL = 50;

function delayOf(state: HoverState, delays: HoverDelays): number {
  if (!state.expanded) return delays.open;
  return state.entered ? delays.close : delays.untouched;
}

/** Opens after a pause in the compact shell, closes after a while outside the open one. */
export function nextHover(
  state: HoverState,
  cursor: Point,
  area: HoverArea,
  now: number,
  delays: HoverDelays = RECORDING_HOVER,
): HoverState {
  if (state.expanded && contains(area.open, cursor)) return { expanded: true, entered: true };
  const wantsChange = state.expanded || contains(area.compact, cursor);
  if (!wantsChange) return { expanded: false };
  const since = state.since ?? now;
  // Opened from the compact shell, the cursor is already in.
  const flipped = !state.expanded;
  if (now - since >= delayOf(state, delays)) return { expanded: flipped, entered: flipped };
  return { ...state, since };
}

export interface HoverDeps {
  /** Screen point of the cursor, as `screen.getCursorScreenPoint()`. */
  cursor(): Point;
  /** Null while the island has no place on screen. */
  area(): HoverArea | null;
  onChange(expanded: boolean): void;
  delays?: HoverDelays;
  /** Where it starts: closed for the recording island, open and not entered for the ready one. */
  initial?: HoverState;
  /** While true, an open island stays open and its countdown starts again afterwards. */
  hold?(): boolean;
  now?(): number;
}

export interface IslandHover {
  /** Opens at once, as if the cursor had never come: the untouched delay applies. */
  expand(): void;
  stop(): void;
}

// The window lets every click through while closed, so the DOM sees no hover: the cursor is polled.
export function startIslandHover({
  cursor,
  area,
  onChange,
  delays = RECORDING_HOVER,
  initial = { expanded: false },
  hold = () => false,
  now = () => performance.now(),
}: HoverDeps): IslandHover {
  let state: HoverState = initial;
  const tick = () => {
    const current = area();
    if (!current) return;
    const point = cursor();
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
      onChange(true);
    },
    stop: () => clearInterval(timer),
  };
}
