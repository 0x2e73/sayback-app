import { useLayoutEffect, useRef, useState } from 'react';

/** First visit keeps the tab bar where it is: never further down than its anchor. */
export function restoredScroll(
  saved: number | undefined,
  previousTop: number,
  anchorTop: number,
): number {
  return saved ?? Math.min(previousTop, anchorTop);
}

/** One scroll container for every tab; each tab gets its own position back. */
export function useTabScroll<T extends string>(initial: T) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<T, number>());
  const leftAt = useRef<number | null>(null);
  const [tab, setTab] = useState(initial);

  function select(next: T): void {
    if (next === tab) return;
    const scroller = scrollerRef.current;
    if (scroller) {
      positions.current.set(tab, scroller.scrollTop);
      leftAt.current = scroller.scrollTop;
    }
    setTab(next);
  }

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const previous = leftAt.current;
    if (!scroller || previous === null) return;
    leftAt.current = null;
    const anchor = anchorRef.current?.offsetTop ?? 0;
    scroller.scrollTop = restoredScroll(positions.current.get(tab), previous, anchor);
  }, [tab]);

  return { tab, select, scrollerRef, anchorRef };
}
