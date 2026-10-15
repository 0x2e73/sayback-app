import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { normalizeSelection } from '../shared/capture-selection';
import type { CapturePrefs } from '../shared/contracts';
import { capturePrefsSchema } from '../shared/validation';
import type { RegisterHandler } from './ipc';

export interface CapturePrefsStore {
  get(): CapturePrefs;
  /** Throws on anything that is not a full, valid set of choices; the stored ones stay. */
  set(input: unknown): void;
}

// A wrong field falls back alone: one bad value must not erase the other habits.
const storedSchema = z.object({
  microphone: capturePrefsSchema.shape.microphone.catch(true),
  systemAudio: capturePrefsSchema.shape.systemAudio.catch(true),
  screen: capturePrefsSchema.shape.screen.catch(true),
  autoAnalyze: capturePrefsSchema.shape.autoAnalyze.catch(true),
  screenId: capturePrefsSchema.shape.screenId.catch(undefined),
});

function normalized(prefs: CapturePrefs): CapturePrefs {
  const { screenId, ...rest } = prefs;
  return { ...rest, ...normalizeSelection(prefs), ...(screenId ? { screenId } : {}) };
}

function load(path: string): CapturePrefs {
  const defaults = storedSchema.parse({});
  if (!existsSync(path)) return normalized(defaults);
  try {
    const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return normalized(storedSchema.parse(raw));
  } catch {
    return normalized(defaults);
  }
}

export function createCapturePrefsStore(path: string): CapturePrefsStore {
  let current = load(path);
  return {
    get: () => current,
    set(input) {
      const next = normalized(capturePrefsSchema.parse(input));
      writeFileSync(`${path}.tmp`, JSON.stringify(next), { mode: 0o600 });
      renameSync(`${path}.tmp`, path);
      current = next;
    },
  };
}

export function registerCapturePrefs(handle: RegisterHandler, store: CapturePrefsStore): void {
  handle('capture-prefs:get', () => store.get());
  handle('capture-prefs:set', (input) => store.set(input));
}
