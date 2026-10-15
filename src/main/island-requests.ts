import type { IslandRequest, SelectScreen } from '../shared/island';
import type { IslandStart } from '../shared/recording-start';
import type { IslandPorts } from './island-ports';
import type { ReadySession } from './island-ready';
import type { RecordingScreens } from './island-recording';

type IslandCommand = Exclude<IslandRequest, IslandStart | SelectScreen>;

/** What the requests of the page reach in the controller. */
export interface RequestTarget {
  mode(): 'ready' | 'recording' | null;
  session(): ReadySession | null;
  screens(): RecordingScreens | null;
  /** A click on the closed wings of the recording island. */
  expand(): void;
  /** Folds the island away. */
  dismiss(): void;
}

export interface IslandRequests {
  handle(request: IslandRequest): Promise<void> | void;
}

type RequestPorts = Pick<IslandPorts, 'request' | 'openPrivacySettings' | 'openApp' | 'openDialog'>;

const report = (what: string) => (error: unknown) => console.error(`[island] ${what}`, error);

/** Every request of the island page; a screen switch during a recording settles once tried. */
export function createIslandRequests(target: RequestTarget, ports: RequestPorts): IslandRequests {
  // The × and Escape (sent as `close` by the page) wait for a busy start: closing would hide its outcome.
  function closeReady(): void {
    if (target.mode() === 'ready' && !target.session()?.isBusy()) target.dismiss();
  }

  // Ready, « Ouvrir SayBack » opens the dialog, to change the title or pick a window.
  function openFromIsland(): void {
    if (target.mode() !== 'ready') return ports.openApp();
    ports.openDialog();
    target.dismiss();
  }

  const commands: Record<IslandCommand, () => void> = {
    pause: () => ports.request('pause'),
    resume: () => ports.request('resume'),
    stop: () => ports.request('stop'),
    open: openFromIsland,
    expand: () => {
      if (target.mode() === 'recording') target.expand();
    },
    close: closeReady,
    'open-privacy-settings': () => {
      if (target.mode() === 'ready') ports.openPrivacySettings();
    },
    'refresh-screens': () => {
      target.session()?.retryScreens().catch(report('listing the screens failed'));
    },
  };

  function selectScreen(screenId: string): Promise<void> | undefined {
    if (target.mode() === 'ready') return target.session()?.selectScreen(screenId);
    return target.screens()?.select(screenId);
  }

  return {
    handle(request) {
      if (typeof request === 'string') return commands[request]();
      if (request.type === 'select-screen') return selectScreen(request.screenId);
      target.session()?.start(request).catch(report('the start failed'));
    },
  };
}
