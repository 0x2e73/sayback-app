import { contains, type Point, type Rect } from './island-geometry';

export interface HoverArea {
  compact: Rect;
  open: Rect;
}

export interface HoverState {
  expanded: boolean;
  /** Since when (ms) the cursor has been where it asks for the other state. */
  since?: number;
}

const POLL_INTERVAL = 50;
const OPEN_DELAY = 120;
const CLOSE_DELAY = 300;

/** Opens after a pause in the compact shell, closes after a while outside the open one. */
export function nextHover(
  state: HoverState,
  cursor: Point,
  area: HoverArea,
  now: number,
): HoverState {
  const wantsChange = state.expanded
    ? !contains(area.open, cursor)
    : contains(area.compact, cursor);
  if (!wantsChange) return { expanded: state.expanded };
  const since = state.since ?? now;
  const delay = state.expanded ? CLOSE_DELAY : OPEN_DELAY;
  if (now - since >= delay) return { expanded: !state.expanded };
  return { expanded: state.expanded, since };
}

interface HoverDeps {
  /** Screen point of the cursor, as `screen.getCursorScreenPoint()`. */
  cursor(): Point;
  /** Null while the island has no place on screen. */
  area(): HoverArea | null;
  onChange(expanded: boolean): void;
  now?(): number;
}

export interface IslandHover {
  stop(): void;
}

// The window lets every click through while closed, so the DOM sees no hover: the cursor is polled.
export function startIslandHover({
  cursor,
  area,
  onChange,
  now = () => performance.now(),
}: HoverDeps): IslandHover {
  let state: HoverState = { expanded: false };
  const timer = setInterval(() => {
    const point = cursor();
    const current = area();
    if (!current) return;
    const next = nextHover(state, point, current, now());
    if (next.expanded !== state.expanded) onChange(next.expanded);
    state = next;
  }, POLL_INTERVAL);
  return {
    stop: () => clearInterval(timer),
  };
}
