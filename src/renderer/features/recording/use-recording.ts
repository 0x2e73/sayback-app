import { errorMessage } from '../../../shared/format';
import { useCallback, useRef, useState } from 'react';
import type { DesktopApi, Meeting } from '../../../shared/contracts';

import { useCaptureOpener } from './capture-opener';
import type { CaptureOptions, CaptureSession } from './capture-session';

export function useRecording(
  api: DesktopApi,
  onFinished: (meeting: Meeting, autoAnalyze: boolean) => void,
) {
  const [capture, setCapture] = useState<CaptureSession | null>(null);
  const [stopping, setStopping] = useState(false);
  const [interrupted, setInterrupted] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<CaptureSession | null>(null);
  const openCapture = useCaptureOpener(api);
  const finishing = useRef(false);
  const interruption = useRef<{ meeting?: Meeting } | null>(null);
  const autoAnalyze = useRef(false);

  const stop = useCallback(() => {
    if (!active.current || finishing.current || interruption.current) return;
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

  // The capture stays on screen until the user opens the meeting that was kept.
  const interrupt = useCallback((failure: Error) => {
    setError(failure.message);
    const session = active.current;
    if (!session || finishing.current || interruption.current) return;
    finishing.current = true;
    interruption.current = {};
    setInterrupted(true);
    setStopping(true);
    const state = interruption.current;
    void session
      .stop()
      .then((meeting) => {
        state.meeting = meeting;
      })
      .catch(() => undefined)
      .finally(() => {
        finishing.current = false;
        setStopping(false);
      });
  }, []);

  const openInterrupted = useCallback(() => {
    const session = active.current;
    const state = interruption.current;
    if (!session || !state || finishing.current) return;
    active.current = null;
    interruption.current = null;
    setInterrupted(false);
    setError('');
    setCapture(null);
    onFinished(state.meeting ?? session.meeting, autoAnalyze.current);
  }, [onFinished]);

  async function start(
    title: string,
    options: Omit<CaptureOptions, 'onFailure' | 'onEnded'>,
    analyzeAfterStop: boolean,
    deadline?: number,
  ) {
    const handlers = { onFailure: interrupt, onEnded: stop };
    const running = active.current !== null;
    const session = await openCapture(running, title, { ...options, ...handlers }, deadline);
    active.current = session;
    autoAnalyze.current = analyzeAfterStop;
    setCapture(session);
    setInterrupted(false);
    setError('');
  }

  return { capture, stopping, interrupted, error, start, stop, openInterrupted };
}
