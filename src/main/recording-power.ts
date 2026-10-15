import type { RecordingSnapshot } from './recording-state-hub';

interface ThrottledPage {
  setBackgroundThrottling(allowed: boolean): void;
  isDestroyed(): boolean;
}

export interface PowerPorts {
  /** The main window page, which owns the capture; null once it is closed. */
  page(): ThrottledPage | null;
  blocker: {
    start(type: 'prevent-app-suspension'): number;
    stop(id: number): void;
  };
}

/**
 * A hidden or minimised window slows its timers down: the level and the island would lag.
 * The page runs at full speed and the app stays awake only while a recording runs.
 */
export function createRecordingPower(ports: PowerPorts): (snapshot: RecordingSnapshot) => void {
  let blockerId: number | undefined;

  function throttle(allowed: boolean): void {
    const page = ports.page();
    if (page && !page.isDestroyed()) page.setBackgroundThrottling(allowed);
  }

  return ({ state }) => {
    if (state.recording && blockerId === undefined) {
      throttle(false);
      blockerId = ports.blocker.start('prevent-app-suspension');
      return;
    }
    if (!state.recording && blockerId !== undefined) {
      throttle(true);
      ports.blocker.stop(blockerId);
      blockerId = undefined;
    }
  };
}
