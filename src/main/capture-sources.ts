import { systemPreferences } from 'electron';
import type { CapturePermission, CapturePermissionKind, CaptureSource } from '../shared/contracts';

export interface RawSource {
  id: string;
  name: string;
  display_id: string;
  thumbnail: { toDataURL(): string };
}

/** Anything that may be one of SayBack's own windows: a destroyed one has no source identifier. */
export interface OwnWindow {
  isDestroyed(): boolean;
  getMediaSourceId(): string;
}

/** `window:<id>:<n>` : the last segment differs between listings of the same window. */
const windowKey = (sourceId: string) => sourceId.split(':').slice(0, 2).join(':');

export function ownSourceIds(windows: readonly (OwnWindow | null)[]): Set<string> {
  const ids = new Set<string>();
  for (const window of windows) {
    try {
      if (window && !window.isDestroyed()) ids.add(windowKey(window.getMediaSourceId()));
    } catch {
      // A window closing right now has nothing to hide.
    }
  }
  return ids;
}

/**
 * Without SayBack's own windows. The screens come first, the main one as « Écran 1 », so the
 * default choice is always the first line; the windows keep the order the system gave.
 */
export function presentSources(
  raw: readonly RawSource[],
  primaryDisplayId: string,
  hidden: ReadonlySet<string>,
): CaptureSource[] {
  const shown = raw.filter((source) => !hidden.has(windowKey(source.id)));
  const isScreen = (source: RawSource) => source.id.startsWith('screen:');
  const isMain = (source: RawSource) => source.display_id === primaryDisplayId;
  const screens = [
    ...shown.filter((source) => isScreen(source) && isMain(source)),
    ...shown.filter((source) => isScreen(source) && !isMain(source)),
  ];
  const windows = shown.filter((source) => !isScreen(source));
  return [
    ...screens.map((source, index): CaptureSource => {
      const base = {
        id: source.id,
        name: `Écran ${index + 1}`,
        thumbnail: source.thumbnail.toDataURL(),
      };
      return isMain(source) ? { ...base, primary: true } : base;
    }),
    ...windows.map((source) => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL(),
    })),
  ];
}

/** `restricted` (parental controls) blocks like a refusal; `unknown` leaves the user to try. */
export function capturePermission(kind: CapturePermissionKind): CapturePermission {
  if (process.platform !== 'darwin') return 'granted';
  const status = systemPreferences.getMediaAccessStatus(kind);
  if (status === 'granted') return 'granted';
  if (status === 'denied' || status === 'restricted') return 'denied';
  return 'not-determined';
}
