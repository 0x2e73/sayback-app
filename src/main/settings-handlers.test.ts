import { describe, expect, it, vi } from 'vitest';
import type { Appearance } from '../shared/contracts';
import type { RegisterHandler } from './ipc';
import type { DesktopServices } from './services';

const electron = vi.hoisted(() => ({ shell: {} as { openExternal?: unknown } }));
vi.mock('electron', () => ({ shell: electron.shell }));

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

describe('privacy panes', () => {
  function panes() {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const limits = new Map<string, number | undefined>();
    const handle: RegisterHandler = (channel, action, _roles, perSecond) => {
      handlers.set(channel, action);
      limits.set(channel, perSecond);
    };
    registerSettingsHandlers(
      handle,
      { credentials: {}, models: {} } as unknown as DesktopServices,
      '/data',
      () => {},
    );
    return { handlers, limits };
  }

  it.each([
    ['privacy:open-screen-settings', 'Privacy_ScreenCapture'],
    ['privacy:open-microphone-settings', 'Privacy_Microphone'],
  ])('%s opens the %s pane on macOS', async (channel, pane) => {
    const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    const openExternal = vi.fn(async () => undefined);
    electron.shell.openExternal = openExternal;
    try {
      await panes().handlers.get(channel)?.();
    } finally {
      platform.mockRestore();
    }
    expect(openExternal).toHaveBeenCalledWith(
      `x-apple.systempreferences:com.apple.preference.security?${pane}`,
    );
  });

  it.each(['privacy:open-screen-settings', 'privacy:open-microphone-settings'])(
    '%s refuses elsewhere than macOS, without opening anything',
    async (channel) => {
      const platform = vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
      const openExternal = vi.fn(async () => undefined);
      electron.shell.openExternal = openExternal;
      try {
        await expect(panes().handlers.get(channel)?.()).rejects.toThrow('uniquement sur macOS');
      } finally {
        platform.mockRestore();
      }
      expect(openExternal).not.toHaveBeenCalled();
    },
  );

  it('limits the rate of both panes', () => {
    const { limits } = panes();
    expect(limits.get('privacy:open-screen-settings')).toBeGreaterThan(0);
    expect(limits.get('privacy:open-microphone-settings')).toBeGreaterThan(0);
  });
});
