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

export function ownSourceIds(windows: readonly (OwnWindow | null)[]): Set<string> {
  const ids = new Set<string>();
  for (const window of windows) {
    try {
      if (window && !window.isDestroyed()) ids.add(window.getMediaSourceId());
    } catch {
      // A window closing right now has nothing to hide.
    }
  }
  return ids;
}

/** Without SayBack's own windows; screens are named in French and the main one is marked. */
export function presentSources(
  raw: readonly RawSource[],
  primaryDisplayId: string,
  hidden: ReadonlySet<string>,
): CaptureSource[] {
  let screens = 0;
  return raw
    .filter((source) => !hidden.has(source.id))
    .map((source) => {
      const common = { id: source.id, thumbnail: source.thumbnail.toDataURL() };
      if (!source.id.startsWith('screen:')) return { ...common, name: source.name };
      screens += 1;
      const primary = source.display_id === primaryDisplayId;
      return { ...common, name: `Écran ${screens}`, ...(primary ? { primary } : {}) };
    });
}

/** `restricted` (parental controls) blocks like a refusal; `unknown` leaves the user to try. */
export function capturePermission(kind: CapturePermissionKind): CapturePermission {
  if (process.platform !== 'darwin') return 'granted';
  const status = systemPreferences.getMediaAccessStatus(kind);
  if (status === 'granted') return 'granted';
  if (status === 'denied' || status === 'restricted') return 'denied';
  return 'not-determined';
}
