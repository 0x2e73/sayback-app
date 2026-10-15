import { chronoLabel } from '../shared/format';
import { elapsedAt } from '../shared/recording-state';
import { menuBarTemplate, type MenuBarActions, type MenuBarEntry } from './menu-bar-menu';
import type { RecordingSnapshot } from './recording-state-hub';

export interface TrayPort {
  setTitle(title: string): void;
  popUpContextMenu(menu: unknown): void;
  on(event: 'click' | 'right-click', listener: () => void): unknown;
  destroy(): void;
}

interface MenuBarDeps {
  createTray(): TrayPort;
  buildMenu(template: MenuBarEntry[]): unknown;
  actions: MenuBarActions;
  /** A left click: the island. */
  onClick(): void;
  /** Same monotonic clock as the recording state hub. */
  now?(): number;
}

export interface MenuBar {
  announce(snapshot: RecordingSnapshot): void;
  destroy(): void;
}

export function createMenuBar({
  createTray,
  buildMenu,
  actions,
  onClick,
  now = () => performance.now(),
}: MenuBarDeps): MenuBar {
  const tray = createTray();
  let timer: ReturnType<typeof setInterval> | undefined;
  // Not set as the context menu: macOS would open it on the left click too.
  let menu = buildMenu(menuBarTemplate({ recording: false }, actions));
  tray.on('click', onClick);
  tray.on('right-click', () => tray.popUpContextMenu(menu));

  function stopTimer(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  function announce({ state, receivedAt }: RecordingSnapshot): void {
    stopTimer();
    menu = buildMenu(menuBarTemplate(state, actions));
    if (!state.recording) {
      tray.setTitle('');
      return;
    }
    const label = () => chronoLabel(elapsedAt(state, receivedAt, now()));
    tray.setTitle(label());
    if (state.paused || state.stopping) return;
    timer = setInterval(() => tray.setTitle(label()), 1000);
  }

  function destroy(): void {
    stopTimer();
    tray.destroy();
  }

  return { announce, destroy };
}
