import { describe, expect, it } from 'vitest';
import { contrast, describeLook, looks, read } from './design-tokens-support';

// The island is black and dark whatever the theme: it rebinds the shared tokens to its own.
describe.each(looks.map((look) => [describeLook(look), look] as const))(
  'island in %s',
  (_n, look) => {
    it.each([
      ['--color-island-text', '--color-island'],
      ['--color-island-text-muted', '--color-island'],
      ['--color-island-text-subtle', '--color-island'],
      ['--color-island-live', '--color-island'],
      ['--color-island-paused', '--color-island'],
      ['--color-island-danger', '--color-island'],
      ['--color-island-on-action', '--color-island-action'],
    ])('keeps %s readable on %s', (foreground, ground) => {
      expect(contrast(look, foreground, ground)).toBeGreaterThanOrEqual(4.5);
    });
  },
);

it('rebinds every colour the island and its buttons read', () => {
  const rule = /^\.island\s*\{([^}]*)\}/m.exec(read('styles/island.css'))?.[1] ?? '';
  for (const token of [
    'text',
    'text-muted',
    'text-subtle',
    'surface',
    'surface-raised',
    'border',
    'border-strong',
    'accent',
    'live',
    'paused',
    'danger',
    'action',
    'action-hover',
    'on-action',
  ]) {
    expect(rule).toMatch(new RegExp(`--color-${token}:\\s*var\\(--color-island-${token}`));
  }
});

// Declared at the root, a tint is computed there with the theme's accent: the island mixes its own.
it('mixes the accent tints the chips read from the island accent', () => {
  const rule = /^\.island\s*\{([^}]*)\}/m.exec(read('styles/island.css'))?.[1] ?? '';
  for (const tint of ['accent-soft', 'accent-tint']) {
    expect(rule).toMatch(
      new RegExp(`--color-${tint}:\\s*color-mix\\([^;]*var\\(--color-accent\\)`),
    );
  }
});

it('keeps inline styles out of island.html and draws it dark', () => {
  const page = read('island.html');
  expect(page).not.toMatch(/<style[\s>]/i);
  expect(page).toContain('<meta name="color-scheme" content="dark" />');
});
