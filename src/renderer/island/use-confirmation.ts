import { useCallback, useEffect, useState } from 'react';

const CONFIRM_WINDOW = 3_000;

/**
 * A first press arms the action, a second one within 3 s runs it; unconfirmed, it disarms.
 * `active` false (the island closed) disarms at once.
 */
export function useConfirmation(action: () => void, active: boolean) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), CONFIRM_WINDOW);
    return () => clearTimeout(timer);
  }, [armed]);

  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) setArmed(false);
  }

  const press = useCallback(() => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setArmed(false);
    action();
  }, [action, armed]);

  return { armed, press };
}
