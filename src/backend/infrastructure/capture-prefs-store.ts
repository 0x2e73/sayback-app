import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';
import { normalizeSelection } from '../../shared/capture-selection';
import type { CapturePrefs } from '../../shared/contracts';
import { capturePrefsSchema } from '../../shared/validation';
import { writeFileAtomic } from './safe-files';

export interface CapturePrefsStore {
  get(): CapturePrefs;
  /** Throws on anything that is not a full, valid set of choices; the stored ones stay. */
  set(input: unknown): Promise<void>;
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
  // One write at a time: two quick choices must not race on the same file.
  let queue: Promise<void> = Promise.resolve();
  async function write(input: unknown): Promise<void> {
    const next = normalized(capturePrefsSchema.parse(input));
    await writeFileAtomic(path, JSON.stringify(next), { mode: 0o600 });
    current = next;
  }
  return {
    get: () => current,
    set(input) {
      const done = queue.then(() => write(input));
      queue = done.catch(() => undefined);
      return done;
    },
  };
}
