import { useCallback, useEffect, useState, type RefObject } from 'react';
import { isScrollKey, isScrollbarPointer, type KeyTarget } from './follow-rules';

const EDITABLE = 'input, textarea, select, [contenteditable="true"]';
const CONTROL = 'button, a[href], summary, [role="tab"], [role="slider"]';

export function keyTarget(target: EventTarget | null): KeyTarget {
  if (!(target instanceof Element)) return 'other';
  if (target.closest(EDITABLE)) return 'editable';
  return target.closest(CONTROL) ? 'control' : 'other';
}

export interface FollowPlayback {
  following: boolean;
  follow(): void;
  release(): void;
}

function listenForGestures(scroller: HTMLElement, release: () => void): () => void {
  // Ctrl + wheel is a pinch to zoom, not a scroll.
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) release();
  };
  const onKey = (event: KeyboardEvent) => {
    const { target } = event;
    const inside =
      target === document.body || (target instanceof Node && scroller.contains(target));
    if (inside && isScrollKey(event.key, keyTarget(target))) release();
  };
  const onPointer = (event: PointerEvent) => {
    const pointer = {
      onScroller: event.target === scroller,
      offsetX: event.offsetX,
      clientWidth: scroller.clientWidth,
      offsetWidth: scroller.offsetWidth,
    };
    if (isScrollbarPointer(pointer)) release();
  };
  scroller.addEventListener('wheel', onWheel, { passive: true });
  scroller.addEventListener('touchmove', release, { passive: true });
  scroller.addEventListener('pointerdown', onPointer);
  window.addEventListener('keydown', onKey);
  return () => {
    scroller.removeEventListener('wheel', onWheel);
    scroller.removeEventListener('touchmove', release);
    scroller.removeEventListener('pointerdown', onPointer);
    window.removeEventListener('keydown', onKey);
  };
}

/** Only a gesture of the reader stops the follow: a `scroll` event is also what the follow causes. */
export function useFollowPlayback(
  scrollerRef: RefObject<HTMLElement | null>,
  listening: boolean,
): FollowPlayback {
  const [following, setFollowing] = useState(true);
  const follow = useCallback(() => setFollowing(true), []);
  const release = useCallback(() => setFollowing(false), []);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !listening) return;
    return listenForGestures(scroller, release);
  }, [scrollerRef, listening, release]);
  return { following, follow, release };
}
