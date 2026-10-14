import { describe, expect, it } from 'vitest';
import { tokenValue } from '../renderer/design-tokens-support';
import { windowChrome } from './window-chrome';

describe('windowChrome', () => {
  it('lets the vibrancy show through on macOS', () => {
    expect(windowChrome('darwin')).toEqual({
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 16, y: 18 },
      vibrancy: 'sidebar',
      visualEffectState: 'active',
      backgroundColor: '#00000000',
    });
  });

  it.each(['win32', 'linux'] as const)(
    'keeps the default frame on %s, painted like the page',
    (platform) => {
      expect(windowChrome(platform)).toEqual({ backgroundColor: tokenValue('--color-bg') });
    },
  );
});
