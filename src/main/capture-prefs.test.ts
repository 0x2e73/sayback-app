import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { CapturePrefs } from '../shared/contracts';
import { createCapturePrefsStore, registerCapturePrefs } from './capture-prefs';
import type { RegisterHandler } from './ipc';

let folder: string;
let path: string;
beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'sayback-prefs-'));
  path = join(folder, 'capture-prefs.json');
});
afterEach(() => rmSync(folder, { recursive: true, force: true }));

const everything: CapturePrefs = {
  microphone: true,
  systemAudio: true,
  screen: true,
  autoAnalyze: true,
};

it('offers everything on, analysis included, before anything was remembered', () => {
  expect(createCapturePrefsStore(path).get()).toEqual(everything);
});

it('remembers the choices across restarts', () => {
  const chosen: CapturePrefs = {
    microphone: false,
    systemAudio: true,
    screen: true,
    autoAnalyze: false,
    screenId: 'screen:2:0',
  };
  createCapturePrefsStore(path).set(chosen);
  expect(createCapturePrefsStore(path).get()).toEqual(chosen);
});

it('reads a damaged file as the defaults', () => {
  writeFileSync(path, '{ not json');
  expect(createCapturePrefsStore(path).get()).toEqual(everything);
});

it('loses only the field that is wrong', () => {
  writeFileSync(path, JSON.stringify({ ...everything, microphone: false, screenId: 'window:3:0' }));
  expect(createCapturePrefsStore(path).get()).toEqual({ ...everything, microphone: false });
});

it('drops a system audio stored without a screen', () => {
  writeFileSync(path, JSON.stringify({ ...everything, screen: false }));
  expect(createCapturePrefsStore(path).get().systemAudio).toBe(false);
});

it.each([
  { ...everything, screenId: 'window:3:0' },
  { ...everything, microphone: 'yes' },
  { microphone: true },
  null,
])('refuses %j and keeps what was stored', (input) => {
  const store = createCapturePrefsStore(path);
  store.set({ ...everything, autoAnalyze: false });
  expect(() => store.set(input)).toThrow();
  expect(store.get().autoAnalyze).toBe(false);
  expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ autoAnalyze: false });
});

it('stores a system audio without screen as off', () => {
  const store = createCapturePrefsStore(path);
  store.set({ ...everything, screen: false });
  expect(store.get()).toMatchObject({ screen: false, systemAudio: false });
});

it('serves the store on the get and set channels', () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const handle: RegisterHandler = (channel, action) => {
    handlers.set(channel, action);
  };
  registerCapturePrefs(handle, createCapturePrefsStore(path));
  handlers.get('capture-prefs:set')?.({ ...everything, microphone: false });
  expect(handlers.get('capture-prefs:get')?.()).toEqual({ ...everything, microphone: false });
});
