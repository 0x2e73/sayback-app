import { useEffect, useState } from 'react';
import type { CaptureSession } from './capture-session';
import { MAX_RECORDING_SECONDS } from './recording-limit';

const TICK = 200;

/** Elapsed seconds of a capture; ends the recording once it reaches the limit. */
export function useRecordingClock(capture: CaptureSession, onLimit: () => void): number {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(capture.elapsed);
      if (capture.elapsed >= MAX_RECORDING_SECONDS) onLimit();
    }, TICK);
    return () => clearInterval(timer);
  }, [capture, onLimit]);
  return elapsed;
}
