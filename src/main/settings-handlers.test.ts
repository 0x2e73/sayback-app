import { expect, it, vi } from 'vitest';
import type { Appearance } from '../shared/contracts';
import type { RegisterHandler } from './ipc';
import type { DesktopServices } from './services';

vi.mock('electron', () => ({ shell: {} }));

import { registerSettingsHandlers } from './meeting-handlers';

function setup() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const handle: RegisterHandler = (channel, action) => {
    handlers.set(channel, action);
  };
  const setAppearance = vi.fn<(value: Appearance) => void>();
  const services = { credentials: { setAppearance }, models: {} } as unknown as DesktopServices;
  const applied: Appearance[] = [];
  registerSettingsHandlers(handle, services, '/data', (value) => applied.push(value));
  const call = (value: unknown) => handlers.get('settings:set-appearance')?.(value);
  return { call, setAppearance, applied };
}

it.each(['system', 'light', 'dark'] as const)('stores %s and applies it to the window', (value) => {
  const { call, setAppearance, applied } = setup();
  call(value);
  expect(setAppearance).toHaveBeenCalledWith(value);
  expect(applied).toEqual([value]);
});

it.each(['sepia', '', null, 3])('refuses %j without storing or applying it', (value) => {
  const { call, setAppearance, applied } = setup();
  expect(() => call(value)).toThrow();
  expect(setAppearance).not.toHaveBeenCalled();
  expect(applied).toEqual([]);
});
