import { elapsedAt, recordingStateSchema, type RecordingState } from '../shared/recording-state';
import type { RegisterHandler } from './ipc';

/** The last state the page announced, and when it arrived on the monotonic clock (ms). */
export interface RecordingSnapshot {
  state: RecordingState;
  receivedAt: number;
}

export type RecordingListener = (snapshot: RecordingSnapshot) => void;

/** The renderer of the main window: when it crashes or goes away, nothing records any more. */
export interface RecordingPage {
  on(event: 'render-process-gone' | 'destroyed', listener: () => void): unknown;
}

export interface RecordingStateHub {
  publish(state: RecordingState): void;
  current(): RecordingSnapshot;
  /** Seconds recorded now. */
  elapsed(): number;
  /** Called on every published state. Returns the unsubscribe function. */
  subscribe(listener: RecordingListener): () => void;
  watch(page: RecordingPage): void;
}

export function createRecordingStateHub(
  now: () => number = () => performance.now(),
): RecordingStateHub {
  let snapshot: RecordingSnapshot = { state: { recording: false }, receivedAt: now() };
  const listeners = new Set<RecordingListener>();

  function publish(state: RecordingState): void {
    snapshot = { state, receivedAt: now() };
    for (const listener of listeners) listener(snapshot);
  }

  function reset(): void {
    if (snapshot.state.recording) publish({ recording: false });
  }

  return {
    publish,
    current: () => snapshot,
    elapsed: () => elapsedAt(snapshot.state, snapshot.receivedAt, now()),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    watch(page) {
      page.on('render-process-gone', reset);
      page.on('destroyed', reset);
    },
  };
}

/** `recording:state` from the main window. Its first call also says the page listens. */
export function registerRecordingState(
  handle: RegisterHandler,
  hub: Pick<RecordingStateHub, 'publish'>,
  rendererReady: () => void,
): void {
  handle('recording:state', (input) => {
    hub.publish(recordingStateSchema.parse(input));
    rendererReady();
  });
}
