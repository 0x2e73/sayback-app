import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { windowChrome } from './window-chrome';

const pageBackground = () => {
  const css = readFileSync(join(import.meta.dirname, '../renderer/styles.css'), 'utf8');
  return /--color-bg:\s*([^;]+);/.exec(css)?.[1]?.trim();
};

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
      expect(windowChrome(platform)).toEqual({ backgroundColor: pageBackground() });
    },
  );
});
