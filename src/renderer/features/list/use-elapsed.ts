import { useEffect, useState } from 'react';

interface Clock {
  readonly elapsed: number;
}

/** Re-reads a running clock every second; the timer never animates. */
export function useElapsed(clock: Clock): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 1_000);
    return () => clearInterval(timer);
  }, [clock]);
  return clock.elapsed;
}
