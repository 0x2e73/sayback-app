import { useCallback, useEffect, useRef, useState, type RefCallback } from 'react';

export type PresenceState = 'open' | 'closing';

export interface PresenceBinding<T extends HTMLElement = HTMLElement> {
  ref: RefCallback<T>;
  state: PresenceState;
}

/** Longest an exit may last before the element goes anyway. */
const SAFETY_MS = 400;

function hasNoDuration(value: string): boolean {
  return value.split(',').every((part) => {
    const text = part.trim();
    return text === '' || Number.parseFloat(text) === 0;
  });
}

/**
 * Keeps an element mounted while its exit transition runs. Attach `ref` to the element whose
 * opacity transitions and `state` to its `data-state`; it unmounts when that opacity ends.
 * Without a transition (tests, no stylesheet) it unmounts at once.
 */
export function usePresence<T extends HTMLElement = HTMLElement>(open: boolean) {
  const [gone, setGone] = useState(!open);
  const [instant, setInstant] = useState(false);
  const element = useRef<T | null>(null);
  // Reopening during the exit brings the element back; after it, mounts a fresh one.
  if (open && gone) setGone(false);

  const ref = useCallback((node: T | null) => {
    element.current = node;
    if (node) setInstant(hasNoDuration(getComputedStyle(node).transitionDuration));
  }, []);

  useEffect(() => {
    if (open || gone) return;
    const node = element.current;
    const finish = (event: TransitionEvent) => {
      if (event.target === node && event.propertyName === 'opacity') setGone(true);
    };
    node?.addEventListener('transitionend', finish);
    const timer = setTimeout(() => setGone(true), SAFETY_MS);
    return () => {
      node?.removeEventListener('transitionend', finish);
      clearTimeout(timer);
    };
  }, [open, gone]);

  const mounted = open || (!gone && !instant);
  const state: PresenceState = open ? 'open' : 'closing';
  return { mounted, state, ref };
}
