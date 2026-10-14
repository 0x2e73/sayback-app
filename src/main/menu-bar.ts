import { recordingStateSchema, type RecordingState } from '../shared/recording-state';
import type { RegisterHandler } from './ipc';
import {
  chronoLabel,
  menuBarTemplate,
  type MenuBarActions,
  type MenuBarEntry,
} from './menu-bar-menu';

export interface TrayPort {
  setTitle(title: string): void;
  setContextMenu(menu: unknown): void;
  destroy(): void;
}

interface MenuBarDeps {
  createTray(): TrayPort;
  buildMenu(template: MenuBarEntry[]): unknown;
  actions: MenuBarActions;
  now?(): number;
}

export interface MenuBar {
  announce(state: RecordingState): void;
  destroy(): void;
}

export function createMenuBar({
  createTray,
  buildMenu,
  actions,
  now = Date.now,
}: MenuBarDeps): MenuBar {
  const tray = createTray();
  let timer: ReturnType<typeof setInterval> | undefined;
  tray.setContextMenu(buildMenu(menuBarTemplate(false, actions)));

  function stopTimer(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  function announce(state: RecordingState): void {
    stopTimer();
    tray.setContextMenu(buildMenu(menuBarTemplate(state.recording, actions)));
    if (!state.recording) {
      tray.setTitle('');
      return;
    }
    const announcedAt = now();
    const label = () => chronoLabel(state.elapsed + (now() - announcedAt) / 1000);
    if (state.paused) {
      tray.setTitle(chronoLabel(state.elapsed));
      return;
    }
    tray.setTitle(label());
    timer = setInterval(() => tray.setTitle(label()), 1000);
  }

  function destroy(): void {
    stopTimer();
    tray.destroy();
  }

  return { announce, destroy };
}

export function registerMenuBarHandlers(
  handle: RegisterHandler,
  menuBar: Pick<MenuBar, 'announce'>,
  rendererReady: () => void,
): void {
  handle('recording:state', (input) => {
    menuBar.announce(recordingStateSchema.parse(input));
    rendererReady();
  });
}
