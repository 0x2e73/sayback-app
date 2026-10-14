import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Below the tab bar the position is the distance beyond the anchor: a header that grew or
 * shrank in between (a notice, a progress line) must not shift the place being read.
 */
export type SavedScroll = { kind: 'above'; top: number } | { kind: 'past'; beyond: number };

export function savedScroll(top: number, anchorTop: number): SavedScroll {
  if (top <= anchorTop) return { kind: 'above', top };
  return { kind: 'past', beyond: top - anchorTop };
}

/** First visit keeps the tab bar where it is: never further down than its anchor. */
export function restoredScroll(
  saved: SavedScroll | undefined,
  previousTop: number,
  anchorTop: number,
): number {
  if (!saved) return Math.min(previousTop, anchorTop);
  return saved.kind === 'above' ? saved.top : anchorTop + saved.beyond;
}

/** One scroll container for every tab; each tab gets its own position back. */
export function useTabScroll<T extends string>(initial: T) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<T, SavedScroll>());
  const leftAt = useRef<number | null>(null);
  const [tab, setTab] = useState(initial);

  const anchorTop = () => anchorRef.current?.offsetTop ?? 0;

  function select(next: T): void {
    if (next === tab) return;
    const scroller = scrollerRef.current;
    if (scroller) {
      positions.current.set(tab, savedScroll(scroller.scrollTop, anchorTop()));
      leftAt.current = scroller.scrollTop;
    }
    setTab(next);
  }

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const previous = leftAt.current;
    if (!scroller || previous === null) return;
    leftAt.current = null;
    scroller.scrollTop = restoredScroll(positions.current.get(tab), previous, anchorTop());
  }, [tab]);

  return { tab, select, scrollerRef, anchorRef };
}
