export type KeyTarget = 'editable' | 'control' | 'other';

const PAGE_KEYS = new Set(['PageUp', 'PageDown']);
const LINE_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End', ' ']);

/** A key that scrolls the transcript; on a control (tab, button), only the page keys still do. */
export function isScrollKey(key: string, target: KeyTarget): boolean {
  if (target === 'editable') return false;
  if (PAGE_KEYS.has(key)) return true;
  return target === 'other' && LINE_KEYS.has(key);
}

// macOS overlay scrollbars take no layout width: the strip they appear in counts.
const OVERLAY_SCROLLBAR_WIDTH = 16;

export interface ScrollbarPointer {
  onScroller: boolean;
  offsetX: number;
  clientWidth: number;
  offsetWidth: number;
}

export function isScrollbarPointer({
  onScroller,
  offsetX,
  clientWidth,
  offsetWidth,
}: ScrollbarPointer): boolean {
  if (!onScroller) return false;
  const strip = offsetWidth > clientWidth ? clientWidth : clientWidth - OVERLAY_SCROLLBAR_WIDTH;
  return offsetX >= strip;
}

export interface Span {
  top: number;
  bottom: number;
}

/** Hidden behind the sticky bars counts as out of view; an unmeasured viewport never does. */
export function isOutOfView(item: Span, viewport: Span, insets: Span): boolean {
  if (viewport.bottom - viewport.top <= insets.top + insets.bottom) return false;
  return item.bottom <= viewport.top + insets.top || item.top >= viewport.bottom - insets.bottom;
}
