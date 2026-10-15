import type { IslandWindowPort } from './island-ports';

// The page folds its shell on `island:expanded` false; the window goes once it is folded.
export const FOLD_FALLBACK = 400;

export interface SurfaceEvents {
  /** The page crashed. */
  crashed(): void;
  /** The window lost the keyboard: a click landed somewhere else. */
  blurred(): void;
}

/** What an island window reports; it starts letting every click through. */
export function watchSurface(target: IslandWindowPort, events: SurfaceEvents): void {
  target.setIgnoreMouseEvents(true);
  target.webContents.on('render-process-gone', events.crashed);
  target.on('blur', events.blurred);
}

export function sendTo(target: IslandWindowPort | null, channel: string, payload: unknown): void {
  if (target && !target.webContents.isDestroyed()) target.webContents.send(channel, payload);
}

/** Folded by the page first, then destroyed. */
export function foldAway(leaving: IslandWindowPort): void {
  leaving.setIgnoreMouseEvents(true);
  sendTo(leaving, 'island:expanded', false);
  setTimeout(() => {
    if (!leaving.isDestroyed()) leaving.destroy();
  }, FOLD_FALLBACK);
}
