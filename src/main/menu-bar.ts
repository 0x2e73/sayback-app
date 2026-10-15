import { chronoLabel } from '../shared/format';
import { elapsedAt } from '../shared/recording-state';
import { menuBarTemplate, type MenuBarActions, type MenuBarEntry } from './menu-bar-menu';
import type { RecordingSnapshot } from './recording-state-hub';

export interface TrayPort {
  setTitle(title: string): void;
  setContextMenu(menu: unknown): void;
  destroy(): void;
}

interface MenuBarDeps {
  createTray(): TrayPort;
  buildMenu(template: MenuBarEntry[]): unknown;
  actions: MenuBarActions;
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
  now = () => performance.now(),
}: MenuBarDeps): MenuBar {
  const tray = createTray();
  let timer: ReturnType<typeof setInterval> | undefined;
  tray.setContextMenu(buildMenu(menuBarTemplate({ recording: false }, actions)));

  function stopTimer(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  function announce({ state, receivedAt }: RecordingSnapshot): void {
    stopTimer();
    tray.setContextMenu(buildMenu(menuBarTemplate(state, actions)));
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
