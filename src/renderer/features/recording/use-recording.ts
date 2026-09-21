import { errorMessage } from '../../../shared/format';
import { useCallback, useRef, useState } from 'react';
import type { DesktopApi, Meeting } from '../../../shared/contracts';

import { CaptureSession, type CaptureOptions } from './capture-session';

export function useRecording(
  api: DesktopApi,
  onFinished: (meeting: Meeting, autoAnalyze: boolean) => void,
) {
  const [capture, setCapture] = useState<CaptureSession | null>(null);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<CaptureSession | null>(null);
  const finishing = useRef(false);
  const autoAnalyze = useRef(false);

  const stop = useCallback(() => {
    if (!active.current || finishing.current) return;
    finishing.current = true;
    setStopping(true);
    void active.current
      .stop()
      .then((meeting) => onFinished(meeting, autoAnalyze.current))
      .catch((failure: unknown) => setError(errorMessage(failure)))
      .finally(() => {
        active.current = null;
        finishing.current = false;
        setCapture(null);
        setStopping(false);
      });
  }, [onFinished]);

  async function start(
    title: string,
    options: Omit<CaptureOptions, 'onFailure' | 'onEnded'>,
    analyzeAfterStop: boolean,
  ) {
    const session = await CaptureSession.start(api, title, {
      ...options,
      onFailure: (failure) => {
        setError(failure.message);
        stop();
      },
      onEnded: stop,
    });
    active.current = session;
    autoAnalyze.current = analyzeAfterStop;
    setCapture(session);
    setError('');
  }

  return { capture, stopping, error, start, stop };
}
