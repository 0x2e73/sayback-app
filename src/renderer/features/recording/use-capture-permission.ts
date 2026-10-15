import { useEffect, useState } from 'react';
import {
  unwrap,
  type CapturePermission,
  type CapturePermissionKind,
  type DesktopApi,
} from '../../../shared/contracts';

/** Read once, on opening. Unknown is not a refusal: a failed read lets the user try. */
export function useCapturePermission(
  api: DesktopApi,
  kind: CapturePermissionKind,
): CapturePermission {
  const [status, setStatus] = useState<CapturePermission>('not-determined');

  useEffect(() => {
    let current = true;
    api
      .getCapturePermission(kind)
      .then(unwrap)
      .catch((): CapturePermission => 'not-determined')
      .then((read) => {
        if (current) setStatus(read);
      });
    return () => {
      current = false;
    };
  }, [api, kind]);

  return status;
}
