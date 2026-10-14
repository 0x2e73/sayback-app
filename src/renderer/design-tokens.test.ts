import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererDir = import.meta.dirname;
const read = (path: string) => readFileSync(join(rendererDir, path), 'utf8');

// Each task adds the sheets it migrates. Task 7 replaces this list with every sheet.
const migratedSheets = [
  'styles.css',
  'styles/shared.css',
  'styles/recording.css',
  'styles/library.css',
  'styles/meetings.css',
];

const colourLiteral = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(|\b(?:white|black)\b/i;
const tokenOnly = /^(?:font-size|border-radius|gap|row-gap|column-gap)$/;
const allowed: Record<string, Set<string>> = {
  'font-weight': new Set(['400', '500', '600', 'inherit']),
  'letter-spacing': new Set(['0', '-0.02em', 'normal']),
};

type Declaration = { property: string; value: string };

function tokenBlock(css: string): string {
  const match = /^:root\s*\{[\s\S]*?^\}/m.exec(css);
  if (!match) throw new Error('styles.css must start with the :root token block');
  return match[0];
}

function declarations(css: string): Declaration[] {
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return body
    .split(/[;{}]/)
    .map((chunk) => /^\s*([a-z-]+)\s*:\s*([\s\S]+?)\s*$/.exec(chunk))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(([, property = '', value = '']) => ({ property, value: value.replace(/\s+/g, ' ') }));
}

function sheetBody(sheet: string): string {
  const css = read(sheet);
  return sheet === 'styles.css' ? css.replace(tokenBlock(css), '') : css;
}

function tokenValue(name: string): string {
  const value = new RegExp(`${name}:\\s*([^;]+);`).exec(tokenBlock(read('styles.css')))?.[1];
  if (!value) throw new Error(`missing token ${name}`);
  return value.trim();
}

type Rgba = [number, number, number, number];

function parseColour(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)?.[1];
  if (hex) {
    const n = Number.parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] ? Number(rgb[4]) : 1];
  throw new Error(`unparsed colour ${value}`);
}

function over(top: Rgba, ground: Rgba): Rgba {
  const alpha = top[3];
  const mix = (i: 0 | 1 | 2) => top[i] * alpha + ground[i] * (1 - alpha);
  return [mix(0), mix(1), mix(2), 1];
}

function luminance([r, g, b]: Rgba): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(foreground: string, ...grounds: string[]): number {
  const ground = grounds
    .map((token) => parseColour(tokenValue(token)))
    .reduce((below, layer) => over(layer, below));
  const text = over(parseColour(tokenValue(foreground)), ground);
  const [a, b] = [luminance(text), luminance(ground)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('design tokens', () => {
  it.each(migratedSheets)('%s has no colour literal outside the token block', (sheet) => {
    const offenders = declarations(sheetBody(sheet))
      .filter(({ value }) => colourLiteral.test(value))
      .map(({ property, value }) => `${property}: ${value}`);
    expect(offenders).toEqual([]);
  });

  it.each(migratedSheets)('%s takes type, radius and gap from tokens', (sheet) => {
    const offenders = declarations(sheetBody(sheet))
      .filter(({ property, value }) => {
        if (tokenOnly.test(property)) return value !== '0' && !value.startsWith('var(');
        const values = allowed[property];
        return values !== undefined && !values.has(value);
      })
      .map(({ property, value }) => `${property}: ${value}`);
    expect(offenders).toEqual([]);
  });

  it.each([
    ['--color-text', ['--color-bg', '--color-surface-raised'], 4.5],
    ['--color-text-muted', ['--color-bg', '--color-surface-raised'], 4.5],
    ['--color-text-subtle', ['--color-bg', '--color-surface-raised'], 4.5],
    ['--color-accent', ['--color-bg', '--color-surface'], 4.5],
    ['--color-focus', ['--color-bg'], 3],
    ['--color-on-action', ['--color-action'], 4.5],
  ] as const)('%s stays readable over %j', (foreground, grounds, minimum) => {
    expect(contrast(foreground, ...grounds)).toBeGreaterThanOrEqual(minimum);
  });

  it.each(['recording', 'recorded', 'processing', 'ready', 'error'])(
    'styles the %s status',
    (status) => {
      expect(read('styles/recording.css')).toMatch(
        new RegExp(`\\.badge-${status}(?:\\s*>\\s*span)?\\s*\\{`),
      );
    },
  );

  it('paints the window with the page background before the CSS loads', () => {
    const windowSource = readFileSync(join(rendererDir, '../main/window.ts'), 'utf8');
    const background = /backgroundColor:\s*'([^']+)'/.exec(windowSource)?.[1];
    expect(background).toBe(tokenValue('--color-bg'));
  });
});
