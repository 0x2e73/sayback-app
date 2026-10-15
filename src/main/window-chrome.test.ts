import { describe, expect, it } from 'vitest';
import { tokenValue, type Theme } from '../renderer/design-tokens-support';
import { followThemeBackground, windowChrome } from './window-chrome';

describe('windowChrome', () => {
  it('lets the vibrancy show through on macOS', () => {
    expect(windowChrome('darwin', false)).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 18 },
      vibrancy: 'sidebar',
      visualEffectState: 'active',
      backgroundColor: '#00000000',
    });
  });

  it('keeps the vibrancy and the transparent ground on macOS in the dark theme too', () => {
    expect(windowChrome('darwin', true)).toEqual(windowChrome('darwin', false));
  });

  it.each([
    ['win32', 'light', false],
    ['linux', 'light', false],
    ['win32', 'dark', true],
    ['linux', 'dark', true],
  ] as const satisfies readonly (readonly [NodeJS.Platform, Theme, boolean])[])(
    'keeps the default frame on %s, painted like the %s page',
    (platform, theme, dark) => {
      expect(windowChrome(platform, dark)).toEqual({
        backgroundColor: tokenValue('--color-bg', theme),
      });
    },
  );
});

function fakes() {
  const listeners: (() => void)[] = [];
  let closed: () => void = () => {};
  const theme = {
    shouldUseDarkColors: false,
    on: (_event: 'updated', listener: () => void) => listeners.push(listener),
    off: (_event: 'updated', listener: () => void) =>
      listeners.splice(listeners.indexOf(listener), 1),
  };
  const painted: string[] = [];
  const window = {
    setBackgroundColor: (color: string) => painted.push(color),
    once: (_event: 'closed', listener: () => void) => {
      closed = listener;
    },
  };
  return { theme, window, painted, listeners, close: () => closed() };
}

describe('followThemeBackground', () => {
  it('repaints the ground of the window when the theme changes', () => {
    const { theme, window, painted, listeners } = fakes();
    followThemeBackground('win32', theme, window);
    theme.shouldUseDarkColors = true;
    listeners.forEach((listener) => listener());
    theme.shouldUseDarkColors = false;
    listeners.forEach((listener) => listener());
    expect(painted).toEqual([tokenValue('--color-bg', 'dark'), tokenValue('--color-bg', 'light')]);
  });

  it('stops listening once the window is closed', () => {
    const { theme, window, listeners, close } = fakes();
    followThemeBackground('linux', theme, window);
    close();
    expect(listeners).toEqual([]);
  });

  it('leaves the vibrancy alone on macOS', () => {
    const { theme, window, listeners } = fakes();
    followThemeBackground('darwin', theme, window);
    expect(listeners).toEqual([]);
  });
});
