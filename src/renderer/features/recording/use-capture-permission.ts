import { useEffect, useState } from 'react';
import {
  unwrap,
  type CapturePermission,
  type CapturePermissionKind,
  type DesktopApi,
} from '../../../shared/contracts';

/**
 * Read on opening, then again whenever the window comes back (the user has been in the macOS
 * settings) and on `refresh`. Unknown is not a refusal: a failed read lets the user try.
 */
export function useCapturePermission(api: DesktopApi, kind: CapturePermissionKind) {
  const [status, setStatus] = useState<CapturePermission>('not-determined');
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let current = true;
    function read(): void {
      api
        .getCapturePermission(kind)
        .then(unwrap)
        .catch((): CapturePermission => 'not-determined')
        .then((next) => {
          if (current) setStatus(next);
        });
    }
    function onVisibility(): void {
      if (document.visibilityState === 'visible') read();
    }
    read();
    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      current = false;
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [api, kind, reads]);

  return { status, refresh: () => setReads((count) => count + 1) };
}
