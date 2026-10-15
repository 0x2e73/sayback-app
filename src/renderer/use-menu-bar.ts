import { useEffect, useRef } from 'react';
import type { DesktopApi } from '../shared/contracts';
import type { RecordingState } from '../shared/recording-state';
import type { CaptureSession } from './features/recording/capture-session';

interface MenuBarHandlers {
  onNewRecording(): void;
  onStopRecording(): void;
}

type MenuBarApi = Pick<
  DesktopApi,
  'announceRecordingState' | 'onMenuBarNewRecording' | 'onMenuBarStopRecording'
>;

// The menu bar icon of the main process starts a recording, stops it, and shows its timer.
export function useMenuBar(
  api: MenuBarApi,
  capture: CaptureSession | null,
  stopping: boolean,
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
    const announce = () => {
      const state: RecordingState = capture
        ? { recording: true, elapsed: capture.elapsed, paused: capture.paused, stopping }
        : { recording: false };
      void api.announceRecordingState(state).catch(() => undefined);
    };
    announce();
    return capture?.onPauseChange(announce);
  }, [api, capture, stopping]);
}
