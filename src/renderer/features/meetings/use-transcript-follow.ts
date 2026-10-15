import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { isOutOfView } from './follow-rules';

export const ACTIVE_TURN = '[aria-current="time"]';

export function scrollToActive(list: HTMLElement | null): void {
  list?.querySelector(ACTIVE_TURN)?.scrollIntoView({ block: 'nearest' });
}

// A held pointer or a selection inside the transcript: moving the text would break the copy.
function isReading(list: HTMLElement, pressed: boolean): boolean {
  if (pressed) return true;
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || !selection.anchorNode) return false;
  return list.contains(selection.anchorNode);
}

/** Keeps the turn playing in view, instantly, unless the reader left the follow or is selecting. */
export function useFollowActive(
  list: RefObject<HTMLDivElement | null>,
  active: number,
  following: boolean,
): void {
  const pressed = useRef(false);
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const press = () => {
      pressed.current = true;
    };
    const lift = () => {
      pressed.current = false;
    };
    element.addEventListener('pointerdown', press);
    window.addEventListener('pointerup', lift);
    window.addEventListener('pointercancel', lift);
    return () => {
      element.removeEventListener('pointerdown', press);
      window.removeEventListener('pointerup', lift);
      window.removeEventListener('pointercancel', lift);
    };
  }, [list]);

  useLayoutEffect(() => {
    const element = list.current;
    if (!element || !following || active < 0 || isReading(element, pressed.current)) return;
    scrollToActive(element);
  }, [list, active, following]);
}

function activeOutOfView(scroller: HTMLElement, list: HTMLElement): boolean {
  const turn = list.querySelector(ACTIVE_TURN);
  if (!turn) return false;
  const style = getComputedStyle(scroller);
  const insets = {
    top: Number.parseFloat(style.scrollPaddingTop) || 0,
    bottom: Number.parseFloat(style.scrollPaddingBottom) || 0,
  };
  return isOutOfView(turn.getBoundingClientRect(), scroller.getBoundingClientRect(), insets);
}

/** Whether the turn playing is out of view; the scroll event only measures, it never stops the follow. */
export function useActiveOutOfView(
  scrollerRef: RefObject<HTMLElement | null>,
  list: RefObject<HTMLDivElement | null>,
  active: number,
): boolean {
  const [outOfView, setOutOfView] = useState(false);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const element = list.current;
    if (!scroller || !element) return;
    const measure = () => setOutOfView(activeOutOfView(scroller, element));
    measure();
    scroller.addEventListener('scroll', measure, { passive: true });
    return () => scroller.removeEventListener('scroll', measure);
  }, [scrollerRef, list, active]);
  return outOfView;
}
