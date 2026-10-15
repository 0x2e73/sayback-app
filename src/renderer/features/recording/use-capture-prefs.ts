import { useEffect, useState } from 'react';
import { defaultCapturePrefs } from '../../../shared/capture-selection';
import { unwrap, type CapturePrefs, type DesktopApi } from '../../../shared/contracts';

/** What was remembered; null while it is being read. A failed read offers the defaults. */
export function useCapturePrefs(api: DesktopApi) {
  const [prefs, setPrefs] = useState<CapturePrefs | null>(null);

  useEffect(() => {
    let current = true;
    api
      .getCapturePrefs()
      .then(unwrap)
      .catch(() => defaultCapturePrefs)
      .then((read) => {
        if (current) setPrefs(read);
      });
    return () => {
      current = false;
    };
  }, [api]);

  return prefs;
}
