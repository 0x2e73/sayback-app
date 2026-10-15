import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { isOutOfView } from './follow-rules';

export const ACTIVE_TURN = '[aria-current="time"]';

export function turnElement(root: ParentNode | null, turnId: string | null): Element | null {
  if (!root || turnId === null) return null;
  return root.querySelector(`[data-turn="${CSS.escape(turnId)}"]`);
}

/** The turn being read: the one playing, else in a silence the last one that has started. */
export function readingTurn(root: Element): Element | null {
  const playing = root.querySelector(ACTIVE_TURN);
  if (playing) return playing;
  const list = root.hasAttribute('data-reading') ? root : root.querySelector('[data-reading]');
  return turnElement(list, list?.getAttribute('data-reading') ?? null);
}

/**
 * A jump the reader asked for lands in the middle. Turns out of view are only estimated
 * (content-visibility): once laid out the target may have moved, so look again next frame.
 */
export function jumpTo(element: Element | null | undefined): void {
  if (!element) return;
  element.scrollIntoView({ block: 'center' });
  requestAnimationFrame(() => {
    if (element.isConnected) element.scrollIntoView({ block: 'center' });
  });
}

// A held pointer or a selection inside the transcript: moving the text would break the copy.
function isReading(list: HTMLElement, pressed: boolean): boolean {
  if (pressed) return true;
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || !selection.anchorNode) return false;
  return list.contains(selection.anchorNode);
}

/** Keeps the turn read in view, instantly, unless the reader left the follow or is selecting. */
export function useFollowReading(
  list: RefObject<HTMLDivElement | null>,
  turnId: string | null,
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
    if (!element || !following || turnId === null || isReading(element, pressed.current)) return;
    turnElement(element, turnId)?.scrollIntoView({ block: 'nearest' });
  }, [list, turnId, following]);
}

function readingOutOfView(scroller: HTMLElement, list: HTMLElement, turnId: string): boolean {
  const turn = turnElement(list, turnId);
  if (!turn) return false;
  const style = getComputedStyle(scroller);
  const insets = {
    top: Number.parseFloat(style.scrollPaddingTop) || 0,
    bottom: Number.parseFloat(style.scrollPaddingBottom) || 0,
  };
  return isOutOfView(turn.getBoundingClientRect(), scroller.getBoundingClientRect(), insets);
}

/** Whether the turn read is out of view; the scroll event only measures, it never stops the follow. */
export function useReadingOutOfView(
  scrollerRef: RefObject<HTMLElement | null>,
  list: RefObject<HTMLDivElement | null>,
  turnId: string | null,
): boolean {
  const [outOfView, setOutOfView] = useState(false);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const element = list.current;
    if (!scroller || !element || turnId === null) return;
    const measure = () => setOutOfView(readingOutOfView(scroller, element, turnId));
    measure();
    scroller.addEventListener('scroll', measure, { passive: true });
    return () => scroller.removeEventListener('scroll', measure);
  }, [scrollerRef, list, turnId]);
  return turnId !== null && outOfView;
}

/** Whether a selection is held inside the list: it counts as a release for the pill. */
export function useSelectionIn(list: RefObject<HTMLDivElement | null>): boolean {
  const [selecting, setSelecting] = useState(false);
  useEffect(() => {
    const check = () => {
      const selection = document.getSelection();
      const anchor = selection?.anchorNode;
      setSelecting(
        Boolean(selection && !selection.isCollapsed && anchor && list.current?.contains(anchor)),
      );
    };
    document.addEventListener('selectionchange', check);
    return () => document.removeEventListener('selectionchange', check);
  }, [list]);
  return selecting;
}
