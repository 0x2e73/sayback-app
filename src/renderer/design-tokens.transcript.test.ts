import { describe, expect, it } from 'vitest';
import {
  contrast,
  describeLook,
  layerContrast,
  looks,
  themes,
  tokenValue,
} from './design-tokens-support';

describe.each(looks.map((look) => [describeLook(look), look] as const))('%s', (_name, look) => {
  it.each([1, 2, 3, 4])('--color-speaker-%s labels a voice on the active turn', (n) => {
    expect(
      contrast(look, `--color-speaker-${n}`, '--color-pane', '--color-surface'),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['--color-highlight', '--color-highlight-strong'])(
    'keeps the text readable on %s, on the active turn too',
    (mark) => {
      expect(
        contrast(look, '--color-text', '--color-pane', '--color-surface', mark),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('shows a match on the page and the current match above the others', () => {
    expect(
      layerContrast(look, ['--color-pane', '--color-highlight'], ['--color-pane']),
    ).toBeGreaterThanOrEqual(1.2);
    for (const ground of [['--color-pane'], ['--color-pane', '--color-surface']]) {
      expect(
        layerContrast(
          look,
          [...ground, '--color-highlight-strong'],
          [...ground, '--color-highlight'],
        ),
      ).toBeGreaterThanOrEqual(1.3);
    }
  });
});

it.each(themes)('gives the speakers four colours of their own in %s', (theme) => {
  const speakers = [1, 2, 3, 4].map((n) => tokenValue(`--color-speaker-${n}`, theme));
  const reserved = ['accent', 'live', 'danger', 'paused', 'ready'].map((name) =>
    tokenValue(`--color-${name}`, theme),
  );
  expect(new Set(speakers).size).toBe(4);
  for (const value of speakers) expect(reserved).not.toContain(value);
});
