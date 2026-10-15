import { expect, it } from 'vitest';
import type { CapturePrefs } from '../shared/contracts';
import type { CapturePrefsStore } from '../backend/infrastructure/capture-prefs-store';
import { registerCapturePrefs } from './capture-prefs';
import type { RegisterHandler } from './ipc';

const prefs: CapturePrefs = {
  microphone: false,
  systemAudio: true,
  screen: true,
  autoAnalyze: true,
};

it('serves the store on the get and set channels', async () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const handle: RegisterHandler = (channel, action) => {
    handlers.set(channel, action);
  };
  let stored = { ...prefs, microphone: true };
  const store: CapturePrefsStore = {
    get: () => stored,
    set: async (input) => {
      stored = input as CapturePrefs;
    },
  };
  registerCapturePrefs(handle, store);
  await handlers.get('capture-prefs:set')?.(prefs);
  expect(handlers.get('capture-prefs:get')?.()).toEqual(prefs);
});
