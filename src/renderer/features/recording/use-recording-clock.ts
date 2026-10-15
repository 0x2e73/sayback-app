import { useEffect, useState } from 'react';
import type { CaptureSession } from './capture-session';

const TICK = 200;

/** Elapsed seconds of a capture, for display only: the two-hour limit lives in the capture. */
export function useRecordingClock(capture: CaptureSession): number {
  const [elapsed, setElapsed] = useState(() => capture.elapsed);
  useEffect(() => {
    const timer = setInterval(() => setElapsed(capture.elapsed), TICK);
    return () => clearInterval(timer);
  }, [capture]);
  return elapsed;
}
