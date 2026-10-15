import { useEffect, useRef } from 'react';
import type { DesktopApi } from '../shared/contracts';
import type { RecordingStartRequest } from '../shared/recording-start';
import type { RecordingRequest, RecordingState } from '../shared/recording-state';
import type { CaptureSession } from './features/recording/capture-session';
import { answerScreenSwitch } from './features/recording/island-switch';

interface RecordingControl {
  capture: CaptureSession | null;
  stopping: boolean;
  stop(): void;
}

type MenuBarApi = Pick<
  DesktopApi,
  | 'announceRecordingState'
  | 'onMenuBarNewRecording'
  | 'onRecordingRequest'
  | 'onStartRequest'
  | 'onScreenSwitchRequest'
  | 'answerScreenSwitch'
  | 'getSources'
  | 'selectSource'
>;

interface MenuBarActions {
  /** « Nouvelle réunion… »: the dialog. */
  onNewRecording(): void;
  /** « Démarrer » in the ready island: the dialog's start, without the dialog. */
  onStartRequest(request: RecordingStartRequest): void;
}

/** What the main process is told: the screen or window shared goes with the time and the pause. */
export function recordingStateOf(
  capture: Pick<CaptureSession, 'elapsed' | 'paused' | 'source'> | null,
  stopping: boolean,
): RecordingState {
  if (!capture) return { recording: false };
  const { elapsed, paused, source } = capture;
  const state: RecordingState = { recording: true, elapsed, paused, stopping };
  return source ? { ...state, sourceId: source.id } : state;
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
    const stopSwitches = api.onScreenSwitchRequest(
      (request) => void answerScreenSwitch(api, request, latest.current.recording),
    );
    return () => {
      stopNew();
      stopStarts();
      stopRequests();
      stopSwitches();
    };
  }, [api]);

  const { capture, stopping } = recording;
  useEffect(() => {
    const announce = () => {
      void api.announceRecordingState(recordingStateOf(capture, stopping)).catch(() => undefined);
    };
    announce();
    if (!capture) return;
    const stopPause = capture.onPauseChange(announce);
    const stopSource = capture.onSourceChange(announce);
    return () => {
      stopPause();
      stopSource();
    };
  }, [api, capture, stopping]);
}
