import { useCallback, useEffect, useState } from 'react';
import type { IslandApi } from '../../shared/contracts';

/** « Changement impossible » replaces the button this long. */
export const SWITCH_FAILURE_SHOWN = 4_000;

interface Failure {
  /** Each failure restarts the 4 s. */
  count: number;
  screenId: string;
}

/**
 * A screen picked during a recording: one request at a time, and whether the last one failed
 * lately. A failure is forgotten once the capture announces the screen it asked for: main may
 * have given up waiting on a switch that still went through.
 */
export function useScreenSwitch(api: Pick<IslandApi, 'request'>, source: string | undefined) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    if (!failure) return;
    const timer = setTimeout(() => setFailure(null), SWITCH_FAILURE_SHOWN);
    return () => clearTimeout(timer);
  }, [failure]);

  const pick = useCallback(
    (screenId: string) => {
      setPending(true);
      const settle = (ok: boolean) => {
        setPending(false);
        if (!ok) setFailure((last) => ({ count: (last?.count ?? 0) + 1, screenId }));
      };
      api.request({ type: 'select-screen', screenId }).then(
        (result) => settle(result.ok),
        () => settle(false),
      );
    },
    [api],
  );

  return { pending, failed: failure !== null && failure.screenId !== source, pick };
}
