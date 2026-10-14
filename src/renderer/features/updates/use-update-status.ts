import { useEffect, useState } from 'react';
import type { DesktopApi, UpdateStatus } from '../../../shared/contracts';

/** The update state, null until first known. A pushed status is newer than any pending read. */
export function useUpdateStatus(api: DesktopApi): UpdateStatus | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    let active = true;
    let pushed = false;
    const unsubscribe = api.onUpdateStatus((next) => {
      pushed = true;
      setStatus(next);
    });
    void api.getUpdateStatus().then((result) => {
      if (active && !pushed && result.ok) setStatus(result.value);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [api]);

  return status;
}
