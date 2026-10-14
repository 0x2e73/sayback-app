import { recordingAnnouncementSchema, type RecordingAnnouncement } from '../shared/menu-bar';
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
  announce(state: RecordingAnnouncement): void;
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

  function announce(state: RecordingAnnouncement): void {
    stopTimer();
    tray.setContextMenu(buildMenu(menuBarTemplate(state.recording, actions)));
    if (!state.recording) {
      tray.setTitle('');
      return;
    }
    const startedAt = Date.parse(state.startedAt);
    const refresh = () => tray.setTitle(chronoLabel((now() - startedAt) / 1000));
    refresh();
    timer = setInterval(refresh, 1000);
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
  handle('menu-bar:recording', (input) => {
    menuBar.announce(recordingAnnouncementSchema.parse(input));
    rendererReady();
  });
}
