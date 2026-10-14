import type { BrowserWindowConstructorOptions } from 'electron';

type WindowChrome = Pick<
  BrowserWindowConstructorOptions,
  'backgroundColor' | 'titleBarStyle' | 'trafficLightPosition' | 'vibrancy' | 'visualEffectState'
>;

// The opaque colour equals --color-bg in src/renderer/styles.css, so no flash before the CSS loads.
export function windowChrome(platform: NodeJS.Platform): WindowChrome {
  if (platform !== 'darwin') return { backgroundColor: '#0f1117' };
  return {
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
  };
}
