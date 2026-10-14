import { useEffect, useRef } from 'react';
import type { DesktopApi } from '../shared/contracts';
import type { CaptureSession } from './features/recording/capture-session';

interface MenuBarHandlers {
  onNewRecording(): void;
  onStopRecording(): void;
}

type MenuBarApi = Pick<
  DesktopApi,
  'announceRecording' | 'onMenuBarNewRecording' | 'onMenuBarStopRecording'
>;

// The menu bar icon of the main process starts a recording, stops it, and shows its timer.
export function useMenuBar(
  api: MenuBarApi,
  capture: CaptureSession | null,
  handlers: MenuBarHandlers,
): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  // Subscribed before the first announcement: that one tells the main process the page listens.
  useEffect(() => {
    const stopNew = api.onMenuBarNewRecording(() => latest.current.onNewRecording());
    const stopStop = api.onMenuBarStopRecording(() => latest.current.onStopRecording());
    return () => {
      stopNew();
      stopStop();
    };
  }, [api]);

  useEffect(() => {
    // The page's own elapsed time is the source: the start is derived once per recording.
    const startedAt = capture ? new Date(Date.now() - capture.elapsed * 1000).toISOString() : null;
    const state = startedAt
      ? { recording: true as const, startedAt }
      : { recording: false as const };
    void api.announceRecording(state).catch(() => undefined);
  }, [api, capture]);
}
