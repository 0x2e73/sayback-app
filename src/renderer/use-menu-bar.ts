import { useEffect, useRef } from 'react';
import type { DesktopApi } from '../shared/contracts';
import type { RecordingStartRequest } from '../shared/recording-start';
import type { RecordingRequest, RecordingState } from '../shared/recording-state';
import type { CaptureSession } from './features/recording/capture-session';

interface RecordingControl {
  capture: CaptureSession | null;
  stopping: boolean;
  stop(): void;
}

type MenuBarApi = Pick<
  DesktopApi,
  'announceRecordingState' | 'onMenuBarNewRecording' | 'onRecordingRequest' | 'onStartRequest'
>;

interface MenuBarActions {
  /** « Nouvelle réunion… »: the dialog. */
  onNewRecording(): void;
  /** « Démarrer » in the ready island: the dialog's start, without the dialog. */
  onStartRequest(request: RecordingStartRequest): void;
}

/** A request that does not apply (pause while paused, anything at rest) changes nothing. */
export function applyRecordingRequest(request: RecordingRequest, recording: RecordingControl) {
  if (request === 'stop') {
    recording.stop();
    return;
  }
  const { capture } = recording;
  if (!capture || recording.stopping) return;
  if (capture.paused !== (request === 'pause')) capture.togglePause();
}

// The main process (menu bar icon, island) starts a recording, pauses, stops it and shows its timer.
export function useMenuBar(
  api: MenuBarApi,
  recording: RecordingControl,
  actions: MenuBarActions,
): void {
  const latest = useRef({ recording, actions });
  useEffect(() => {
    latest.current = { recording, actions };
  });

  // Subscribed before the first announcement: that one tells the main process the page listens.
  useEffect(() => {
    const stopNew = api.onMenuBarNewRecording(() => latest.current.actions.onNewRecording());
    const stopStarts = api.onStartRequest((request) =>
      latest.current.actions.onStartRequest(request),
    );
    const stopRequests = api.onRecordingRequest((request) =>
      applyRecordingRequest(request, latest.current.recording),
    );
    return () => {
      stopNew();
      stopStarts();
      stopRequests();
    };
  }, [api]);

  const { capture, stopping } = recording;
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
