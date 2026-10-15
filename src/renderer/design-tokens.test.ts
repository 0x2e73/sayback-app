import { describe, expect, it } from 'vitest';
import {
  contrast,
  contrastBlock,
  declarations,
  read,
  sheets,
  themeBlock,
  themes,
  tokenBlock,
  tokenBlocks,
  withoutTokens,
  type Declaration,
} from './design-tokens-support';

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

function declaredTokens(css: string): Set<string> {
  const names = [...tokenBlock(css).matchAll(/(--[a-z0-9-]+)\s*:/gi)];
  return new Set(names.flatMap(([, name]) => (name ? [name] : [])));
}

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

function withoutBlocks(css: string): string {
  return tokenBlocks(css).reduce((rest, block) => rest.replace(block, ''), css);
}

function sheetViolations(sheet: string): string[] {
  const css = read(sheet);
  const declared = declaredTokens(read('styles.css'));
  const body = sheet === 'styles.css' ? withoutBlocks(css) : css;
  return cssViolations(body, declared);
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

  describe.each(themes)('%s theme', (theme) => {
    it.each([
      ['--color-text', ['--color-bg', '--color-surface-raised'], 4.5],
      ['--color-text-muted', ['--color-bg', '--color-surface-raised'], 4.5],
      ['--color-text-subtle', ['--color-bg', '--color-surface-raised'], 4.5],
      ['--color-focus', ['--color-bg'], 3],
      ['--color-on-action', ['--color-action'], 4.5],
    ] as const)('%s stays readable over %j', (foreground, grounds, minimum) => {
      expect(contrast(theme, foreground, ...grounds)).toBeGreaterThanOrEqual(minimum);
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
        expect(contrast(theme, `--color-${name}`, ...grounds)).toBeGreaterThanOrEqual(4.5);
      },
    );

    it('shows the hover of the primary action', () => {
      expect(contrast(theme, '--color-action', '--color-action-hover')).toBeGreaterThanOrEqual(1.1);
      expect(contrast(theme, '--color-on-action', '--color-action-hover')).toBeGreaterThanOrEqual(
        4.5,
      );
    });

    it('keeps white text readable on the danger button', () => {
      expect(contrast(theme, '--color-on-action', '--color-danger')).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('keeps the subtle text readable on a light sidebar material over a dark wallpaper', () => {
    const material = '#d4d4d8';
    const grounds = [material, '--color-sidebar-veil', '--color-surface-raised'];
    expect(contrast('light', '--color-text-subtle', ...grounds)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the danger button filled on hover, over the neutral button hover', () => {
    expect(read('styles/shared.css')).toMatch(/\.button-danger:hover\s*\{[^}]*background:/);
  });

  it.each(['processing', 'ready', 'recording', 'error'])('colours the %s status', (status) => {
    const rule = new RegExp(`\\.badge-${status}\\s*\\{[^}]*[\\s;{]color:`);
    expect(read('styles/recording.css')).toMatch(rule);
  });

  it('draws the hollow dot of the recorded status', () => {
    const rule = /\.badge-recorded\s*>\s*span\s*\{[^}]*box-shadow:/;
    expect(read('styles/recording.css')).toMatch(rule);
  });

  it('draws native option lists on an opaque ground', () => {
    const rule = /\bselect option\s*\{[^}]*background-color:\s*var\(--color-overlay\)/;
    expect(read('styles.css')).toMatch(rule);
  });

  it.each(themes)('strengthens the muted tokens in %s when more contrast is requested', (theme) => {
    const block = contrastBlock(read('styles.css'), theme);
    for (const token of ['--color-text-subtle', '--color-border', '--color-border-strong']) {
      expect(block).toContain(`${token}:`);
    }
  });

  it('orders the cascade: light, dark, light contrast, then dark contrast', () => {
    const css = read('styles.css');
    const positions = [
      themeBlock(css, 'light'),
      themeBlock(css, 'dark'),
      contrastBlock(css, 'light'),
      contrastBlock(css, 'dark'),
    ].map((block) => css.indexOf(block));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('lets the system draw both schemes', () => {
    expect(tokenBlock(read('styles.css'))).toMatch(/color-scheme:\s*light dark;/);
    expect(read('index.html')).toContain('<meta name="color-scheme" content="light dark" />');
  });

  it('redeclares in the dark block exactly the colour tokens with a literal value in :root', () => {
    const css = read('styles.css');
    const colourNames = (block: string, literalOnly: boolean) =>
      declarations(block.replace(/^[^{]*\{/, ''))
        .filter(({ property, value }) => {
          if (!property.startsWith('--color-')) return false;
          return !literalOnly || /^(?:#[0-9a-f]{6}|rgb\()/i.test(value);
        })
        .map(({ property }) => property)
        .sort();
    expect(colourNames(themeBlock(css, 'dark'), false)).toEqual(colourNames(tokenBlock(css), true));
    expect(themeBlock(css, 'dark')).toContain('--shadow-float:');
  });

  it('gives the active tab and the media bands their own tokens', () => {
    for (const token of ['--color-thumb', '--color-media']) {
      for (const theme of themes) {
        expect(themeBlock(read('styles.css'), theme)).toContain(`${token}:`);
      }
    }
    expect(read('styles/segmented.css')).toMatch(/aria-selected='true'\]\s*\{[^}]*--color-thumb/);
    expect(read('styles/recording.css')).toMatch(/\.recording-preview\s*\{[^}]*--color-media/);
    expect(read('styles/meeting-detail.css')).toMatch(
      /\.detail-video:fullscreen\s*\{[^}]*--color-media/,
    );
  });
});
