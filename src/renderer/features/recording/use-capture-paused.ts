import { useEffect, useState } from 'react';
import type { CaptureSession } from './capture-session';

/** A pause may come from the menu bar or the island: the label follows the session. */
export function useCapturePaused(capture: CaptureSession): boolean {
  const [paused, setPaused] = useState(capture.paused);
  useEffect(() => {
    setPaused(capture.paused);
    return capture.onPauseChange(() => setPaused(capture.paused));
  }, [capture]);
  return paused;
}
