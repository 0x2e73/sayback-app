import { useCallback, useEffect, useState } from 'react';
import type { IslandApi } from '../../shared/contracts';

/** « Changement impossible » replaces the button this long. */
export const SWITCH_FAILURE_SHOWN = 4_000;

/** A screen picked during a recording, and whether the last switch failed lately. */
export function useScreenSwitch(api: Pick<IslandApi, 'request'>) {
  const [failures, setFailures] = useState(0);
  const [cleared, setCleared] = useState(0);

  useEffect(() => {
    if (failures === 0) return;
    const timer = setTimeout(() => setCleared(failures), SWITCH_FAILURE_SHOWN);
    return () => clearTimeout(timer);
  }, [failures]);

  // The capture goes on with its screen: main answers once the page has tried.
  const pick = useCallback(
    (screenId: string) => {
      const fail = () => setFailures((count) => count + 1);
      api.request({ type: 'select-screen', screenId }).then((result) => {
        if (!result.ok) fail();
      }, fail);
    },
    [api],
  );

  return { failed: failures > cleared, pick };
}
