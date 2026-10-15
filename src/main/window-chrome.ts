import type { BrowserWindowConstructorOptions } from 'electron';

type WindowChrome = Pick<
  BrowserWindowConstructorOptions,
  'backgroundColor' | 'titleBarStyle' | 'trafficLightPosition' | 'vibrancy' | 'visualEffectState'
>;

// The opaque colours equal --color-bg in src/renderer/styles.css, in each theme, so no flash
// before the CSS loads.
const pageBackground = { light: '#f4f5f7', dark: '#0f1117' } as const;

export function windowBackground(dark: boolean): string {
  return dark ? pageBackground.dark : pageBackground.light;
}

export function windowChrome(platform: NodeJS.Platform, dark: boolean): WindowChrome {
  if (platform !== 'darwin') return { backgroundColor: windowBackground(dark) };
  return {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
  };
}

interface ThemeSignal {
  shouldUseDarkColors: boolean;
  on(event: 'updated', listener: () => void): unknown;
  off(event: 'updated', listener: () => void): unknown;
}

interface PaintedWindow {
  setBackgroundColor(color: string): void;
  once(event: 'closed', listener: () => void): unknown;
}

// Outside macOS the ground is opaque and follows the theme; on macOS the vibrancy paints it.
export function followThemeBackground(
  platform: NodeJS.Platform,
  theme: ThemeSignal,
  window: PaintedWindow,
): void {
  if (platform === 'darwin') return;
  const repaint = () => window.setBackgroundColor(windowBackground(theme.shouldUseDarkColors));
  theme.on('updated', repaint);
  window.once('closed', () => theme.off('updated', repaint));
}
