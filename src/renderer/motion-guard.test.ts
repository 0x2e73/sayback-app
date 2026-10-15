import { describe, expect, it } from 'vitest';
import { declarations, read, sheets, tokenBlock } from './design-tokens-support';

const motionProperty = /^(?:-webkit-)?(?:transition|animation)(?:-[a-z-]+)?$/;
const allowedVars =
  /var\(--(?:duration-(?:fast|exit|base|slow|loop|ambient)|delay-(?:1|2|3|wait)|ease-(?:out|move|linear|ambient))\)/g;
// The island shell alone animates its size, on its own curve (exception in frontend.md).
const islandSheet = 'styles/island.css';
const islandVars = /var\(--(?:duration-island|ease-island)\)/g;
const islandProperties = new Set(['width', 'height', 'border-radius']);
const timeLiteral = /(?<![\w.-])[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?m?s(?![\w-])/;
const easingWord = /\b(?:ease|ease-in|ease-out|ease-in-out|linear|steps?|step-start|step-end)\b/;
const easingFunction = /\b(?:cubic-bezier|linear|steps|spring)\(|\bcalc\(/;
const animatedProperties = new Set([
  'none',
  'opacity',
  'transform',
  'background-color',
  'border-color',
  'color',
  'outline-color',
]);
const timingOnly = /^(?:-webkit-)?(?:transition|animation)-(?:duration|delay|timing-function)$/;
const transitionList = /^(?:-webkit-)?transition(?:-property)?$/;
const declaredMotionTokens = [
  '--duration-fast',
  '--duration-exit',
  '--duration-base',
  '--duration-slow',
  '--duration-loop',
  '--duration-ambient',
  '--delay-1',
  '--delay-2',
  '--delay-3',
  '--delay-wait',
  '--ease-out',
  '--ease-move',
  '--ease-linear',
  '--ease-ambient',
  // The island shell alone (exception in frontend.md).
  '--duration-island',
  '--ease-island',
];
const offsetTokens = [
  '--motion-rise',
  '--motion-drop',
  '--motion-slide',
  '--motion-scale-in',
  '--motion-scale-out',
  '--motion-press',
  '--motion-icon',
  '--motion-accept',
];

function declarationProblem(
  { property, value }: { property: string; value: string },
  island: boolean,
): boolean {
  const general = value.toLowerCase().replace(allowedVars, ' ');
  const rest = island ? general.replace(islandVars, ' ') : general;
  if (timeLiteral.test(rest) || easingWord.test(rest) || easingFunction.test(rest)) return true;
  if (/var\(/.test(rest)) return true;
  const words = rest.split(/[\s,]+/).filter(Boolean);
  if (timingOnly.test(property)) return words.length > 0;
  const animated = (word: string) =>
    animatedProperties.has(word) || (island && islandProperties.has(word));
  if (transitionList.test(property)) return words.some((word) => !animated(word));
  return false;
}

function motionViolations(css: string, island = false): string[] {
  return declarations(css)
    .filter(({ property }) => motionProperty.test(property))
    .filter((declaration) => declarationProblem(declaration, island))
    .map(({ property, value }) => `${property}: ${value}`);
}

function sheetMotion(sheet: string): string[] {
  const css = read(sheet);
  const body = sheet === 'styles.css' ? css.replace(tokenBlock(css), '') : css;
  return motionViolations(body, sheet === islandSheet);
}

describe('motion guard', () => {
  it.each([
    'transition: all var(--duration-fast) var(--ease-linear)',
    'transition: all var(--duration-fast) linear',
    'transition: height var(--duration-fast) var(--ease-out)',
    'animation: spin 1.6S linear infinite',
    'animation: pulse var(--duration-base) EASE-IN',
    'transition: opacity var(--duration-fast) step-end',
    'transition: opacity var(--duration-fast) linear(0, 1)',
    '-webkit-transition: opacity 300ms ease',
    'transition: opacity calc(var(--duration-fast) * 3) var(--ease-out)',
    'transition: opacity 1e3ms',
    'transition: opacity var(--duration-fast) cubic-bezier(0, 0, 1, 1)',
    'TRANSITION: opacity 1S',
    'transition-property: height',
    'transition: opacity var(--duration-island) var(--ease-out)',
    'transition: opacity 200ms var(--ease-out)',
    'transition-delay: 40ms',
    'transition-duration: 200ms',
    'animation-timing-function: ease',
  ])('catches %s', (declaration) => {
    expect(motionViolations(`.x { ${declaration}; }`)).not.toEqual([]);
  });

  it.each([
    'transition: opacity var(--duration-fast) var(--ease-out)',
    'transition: none',
    'transition-property: opacity, transform',
    'transition-duration: var(--duration-fast)',
    'animation: spin var(--duration-loop) var(--ease-linear) infinite',
    'animation: state-enter var(--duration-base) var(--ease-out)',
    'transition: opacity var(--duration-slow) var(--ease-move) var(--delay-1)',
    'transition: opacity var(--duration-exit) var(--ease-out) var(--delay-wait)',
    'animation: skeleton-pulse var(--duration-ambient) var(--ease-ambient) infinite alternate',
    'transition-delay: var(--delay-2)',
  ])('lets %s through', (declaration) => {
    expect(motionViolations(`.x { ${declaration}; }`)).toEqual([]);
  });

  it.each([
    'transition: width var(--duration-island) var(--ease-island)',
    'transition: opacity var(--duration-island) var(--ease-out)',
    'transition: border-radius var(--duration-fast) var(--ease-out)',
  ])('keeps the island exception out of the other sheets: %s', (declaration) => {
    expect(motionViolations(`.x { ${declaration}; }`)).not.toEqual([]);
  });

  it('lets the island shell animate its size on its own curve', () => {
    const css = `.island-shell {
      transition:
        width var(--duration-island) var(--ease-island),
        height var(--duration-island) var(--ease-island),
        border-radius var(--duration-island) var(--ease-island);
    }`;
    expect(motionViolations(css, true)).toEqual([]);
    expect(
      motionViolations('.x { transition: top var(--duration-island) var(--ease-island); }', true),
    ).not.toEqual([]);
  });

  it('finds the island sheet', () => {
    expect(sheets).toContain(islandSheet);
  });

  it('lets the grouped colour transition through', () => {
    const css = `.a, .b {
      transition:
        background-color var(--duration-fast) var(--ease-out),
        border-color var(--duration-fast) var(--ease-out),
        color var(--duration-fast) var(--ease-out),
        outline-color var(--duration-fast) var(--ease-out);
    }`;
    expect(motionViolations(css)).toEqual([]);
  });

  it('declares exactly the allowed duration and easing tokens', () => {
    const names = [
      ...tokenBlock(read('styles.css')).matchAll(/(--(?:duration|delay|ease)-[a-z0-9-]+)\s*:/g),
    ];
    expect(names.map(([, name]) => name).sort()).toEqual([...declaredMotionTokens].sort());
  });

  it.each(sheets)('%s takes durations, easing and properties from the whitelist', (sheet) => {
    expect(sheetMotion(sheet)).toEqual([]);
  });

  it.each(sheets.filter((sheet) => sheet !== 'styles.css'))(
    '%s keeps keyframes and reduced motion in styles.css',
    (sheet) => {
      expect(read(sheet)).not.toMatch(/@keyframes|prefers-reduced-motion/);
    },
  );

  it('keeps every duration under 300 ms but the loops, and exits quicker than entrances', () => {
    const css = read('styles.css');
    const milliseconds = (name: string) => {
      const [, amount, unit] = new RegExp(`${name}:\\s*([\\d.]+)(ms|s)`).exec(css) ?? [];
      return Number(amount) * (unit === 's' ? 1000 : 1);
    };
    for (const name of ['fast', 'exit', 'base', 'slow']) {
      expect(milliseconds(`--duration-${name}`)).toBeLessThanOrEqual(300);
    }
    expect(milliseconds('--duration-exit')).toBeLessThan(milliseconds('--duration-base'));
  });

  it('allows infinite loops only on the loop and ambient durations, switched off under reduced motion', () => {
    for (const sheet of sheets) {
      const css = read(sheet);
      const rules = [...css.matchAll(/([^{}]+)\{([^{}]*\binfinite\b[^{}]*)\}/g)];
      for (const [, selector = '', body = ''] of rules) {
        if (sheet === islandSheet) continue;
        expect(body, selector).toMatch(/var\(--duration-(?:loop|ambient)\)/);
        for (const name of selector.split(',').map((part) => part.trim())) {
          expect(reducedBlock(), name).toContain(name);
        }
      }
    }
  });

  it('gives every closing rule that sets a duration the exit duration', () => {
    const durations = sheets.flatMap(closingDurations);
    expect(durations.length).toBeGreaterThan(0);
    for (const value of durations) expect(value).toContain('var(--duration-exit)');
  });

  it('resets every offset token to 0px or 1 and the staggers to 0ms under reduced motion', () => {
    const block = reducedBlock();
    for (const name of offsetTokens) {
      expect(block).toMatch(new RegExp(`${name}:\\s*(?:0px|1);`));
    }
    for (const name of ['--delay-1', '--delay-2', '--delay-3']) {
      expect(block).toMatch(new RegExp(`${name}:\\s*0ms;`));
    }
  });

  it('declares every offset token once', () => {
    const block = tokenBlock(read('styles.css'));
    for (const name of offsetTokens) expect(block).toContain(`${name}:`);
  });

  it.each(sheets)('%s never asks for smooth scrolling', (sheet) => {
    expect(read(sheet)).not.toMatch(/scroll-behavior:\s*smooth/);
  });
});

function reducedBlock(): string {
  const css = read('styles.css');
  const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
  if (start < 0) throw new Error('styles.css needs a prefers-reduced-motion block');
  return css.slice(start, css.indexOf('\n}\n', start) + 3);
}

function closingDurations(sheet: string): string[] {
  const css = read(sheet).replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/\[data-state='closing'\][^{}]*\{([^{}]*)\}/g)]
    .flatMap(([, body = '']) => declarations(body))
    .filter(({ property }) => /duration|^transition$/.test(property))
    .map(({ value }) => value);
}
