import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const rendererDir = import.meta.dirname;
const read = (path: string) => readFileSync(join(rendererDir, path), 'utf8');

const sheets = readdirSync(rendererDir, { recursive: true, encoding: 'utf8' }).filter((file) =>
  file.endsWith('.css'),
);

const colourLiteral = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(|\b(?:white|black)\b/i;
const colourProperty =
  /^(?:color|background(?:-[a-z]+)*|border(?:-[a-z]+)*|outline(?:-[a-z]+)*|box-shadow|text-shadow|fill|stroke|accent-color|caret-color|scrollbar-color|text-decoration(?:-[a-z]+)*|column-rule(?:-[a-z]+)*)$/;
const tokenOnly = /^(?:font-size|font|gap|row-gap|column-gap|(?:[a-z]+-)*radius)$/;
const measure = /^-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%|vw|vh|dvh|deg|s|ms)?$/;
const structuralWords = new Set([
  'solid',
  'dashed',
  'dotted',
  'none',
  'inset',
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'color-mix',
  'in',
  'srgb',
  'underline',
  'line-through',
]);
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
    .map((chunk) => /^\s*([a-z-]+)\s*:\s*([\s\S]+?)\s*$/i.exec(chunk))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(([, property = '', value = '']) => ({
      property: property.toLowerCase(),
      value: value.replace(/\s*!important$/i, '').replace(/\s+/g, ' '),
    }));
}

function declaredTokens(css: string): Set<string> {
  const names = [...tokenBlock(css).matchAll(/(--[a-z0-9-]+)\s*:/gi)];
  return new Set(names.flatMap(([, name]) => (name ? [name] : [])));
}

const withoutTokens = (value: string) => value.replace(/var\(\s*--[a-z0-9-]+\s*\)/gi, ' ');

function usesUnknownToken(value: string, declared: ReadonlySet<string>): boolean {
  return [...value.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].some(
    ([, name]) => name === undefined || !declared.has(name),
  );
}

function breaksTokenOnly(property: string, value: string): boolean {
  if (property === 'font' && value === 'inherit') return false;
  return withoutTokens(value)
    .split(/\s+/)
    .some((part) => part !== '' && part !== '0');
}

function hasForeignColourValue(value: string): boolean {
  return withoutTokens(value)
    .toLowerCase()
    .split(/[\s,()]+/)
    .filter(Boolean)
    .some((word) => !structuralWords.has(word) && !measure.test(word));
}

function isViolation({ property, value }: Declaration, declared: ReadonlySet<string>): boolean {
  if (colourLiteral.test(value)) return true;
  if (/var\(\s*--[a-z0-9-]+\s*,/i.test(value)) return true;
  if (usesUnknownToken(value, declared)) return true;
  if (tokenOnly.test(property)) return breaksTokenOnly(property, value);
  if (colourProperty.test(property)) return hasForeignColourValue(value);
  const values = allowed[property];
  return values !== undefined && !values.has(value);
}

function cssViolations(css: string, declared: ReadonlySet<string>): string[] {
  const found = /@import\b/i.test(css) ? ['@import'] : [];
  const offenders = declarations(css)
    .filter((declaration) => isViolation(declaration, declared))
    .map(({ property, value }) => `${property}: ${value}`);
  return [...found, ...offenders];
}

function sheetViolations(sheet: string): string[] {
  const css = read(sheet);
  const declared = declaredTokens(read('styles.css'));
  const body = sheet === 'styles.css' ? css.replace(tokenBlock(css), '') : css;
  return cssViolations(body, declared);
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
  const alias = /^var\((--[a-z0-9-]+)\)$/.exec(value)?.[1];
  if (alias) return parseColour(tokenValue(alias));
  const mix = /^color-mix\(in srgb, var\((--[a-z0-9-]+)\) ([\d.]+)%, transparent\)$/.exec(value);
  if (mix) {
    const [r, g, b, a] = parseColour(tokenValue(mix[1] ?? ''));
    return [r, g, b, a * (Number(mix[2]) / 100)];
  }
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

describe('guard', () => {
  const declared = new Set(['--color-text', '--color-live', '--color-border', '--space-2']);
  const violations = (css: string) => cssViolations(css, declared);

  it.each([
    'color: red',
    'color: Canvas',
    'color: oklch(70% 0.1 250)',
    'background: color-mix(in srgb, var(--color-live) 10%, gray)',
    'font: 700 1.3rem/1 sans-serif',
    'border-top-left-radius: 5px',
    'gap: var(--space-2, 7px)',
    'font-size: var(--text-nope)',
    `background: url("data:image/svg+xml,<svg><path fill='%23ffcc00'/></svg>")`,
  ])('catches %s', (declaration) => {
    expect(violations(`.x { ${declaration}; }`)).not.toEqual([]);
  });

  it('catches @import', () => {
    expect(violations('@import url("x.css");')).not.toEqual([]);
  });

  it.each([
    'color: var(--color-text)',
    'background: color-mix(in srgb, var(--color-live) 10%, transparent)',
    'border: 1px solid var(--color-border)',
    'box-shadow: inset 0 0 0 1px currentColor',
    'gap: var(--space-2) var(--space-2)',
    'border-radius: 0',
    'font: inherit',
    'font-weight: 600',
  ])('lets %s through', (declaration) => {
    expect(violations(`.x { ${declaration}; }`)).toEqual([]);
  });
});

describe('design tokens', () => {
  it('finds the stylesheets', () => {
    expect(sheets).toContain('styles.css');
    expect(sheets.length).toBeGreaterThan(1);
  });

  it.each(sheets)('%s holds only tokens, no literal', (sheet) => {
    expect(sheetViolations(sheet)).toEqual([]);
  });

  it('keeps inline styles out of index.html', () => {
    expect(read('index.html')).not.toMatch(/<style[\s>]/i);
  });

  it.each([
    ['--color-text', ['--color-bg', '--color-surface-raised'], 4.5],
    ['--color-text-muted', ['--color-bg', '--color-surface-raised'], 4.5],
    ['--color-text-subtle', ['--color-bg', '--color-surface-raised'], 4.5],
    ['--color-focus', ['--color-bg'], 3],
    ['--color-on-action', ['--color-action'], 4.5],
  ] as const)('%s stays readable over %j', (foreground, grounds, minimum) => {
    expect(contrast(foreground, ...grounds)).toBeGreaterThanOrEqual(minimum);
  });

  it.each(['live', 'danger', 'paused', 'ready', 'accent'])(
    '--color-%s stays readable on its tint',
    (name) => {
      const grounds = [
        '--color-bg',
        '--color-surface',
        '--color-surface-raised',
        `--color-${name}-tint`,
      ];
      expect(contrast(`--color-${name}`, ...grounds)).toBeGreaterThanOrEqual(4.5);
    },
  );

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
