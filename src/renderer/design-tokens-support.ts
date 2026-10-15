// Test-only helpers: they read the stylesheets from disk.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const rendererDir = import.meta.dirname;
export const sheets = readdirSync(import.meta.dirname, {
  recursive: true,
  encoding: 'utf8',
}).filter((file) => file.endsWith('.css'));
export const read = (path: string) => readFileSync(join(rendererDir, path), 'utf8');

export type Theme = 'light' | 'dark';
export const themes: readonly Theme[] = ['light', 'dark'];

export function tokenBlock(css: string): string {
  const match = /^:root\s*\{[\s\S]*?^\}/m.exec(css);
  if (!match) throw new Error('styles.css must start with the :root token block');
  return match[0];
}

const darkBlock = /^@media \(prefers-color-scheme: dark\)\s*\{[\s\S]*?^\}/m;
const lightContrastBlock = /^@media \(prefers-contrast: more\)\s*\{[\s\S]*?^\}/m;
const darkContrastBlock =
  /^@media \(prefers-contrast: more\) and \(prefers-color-scheme: dark\)\s*\{[\s\S]*?^\}/m;

/** The block that declares the tokens of a theme: `:root` for light, the dark media query for dark. */
export function themeBlock(css: string, theme: Theme): string {
  if (theme === 'light') return tokenBlock(css);
  const match = darkBlock.exec(css);
  if (!match) throw new Error('styles.css needs a prefers-color-scheme: dark block');
  return match[0];
}

/** The reinforcements for `prefers-contrast: more`, in light or combined with dark. */
export function contrastBlock(css: string, theme: Theme): string {
  return (theme === 'light' ? lightContrastBlock : darkContrastBlock).exec(css)?.[0] ?? '';
}

/** The four blocks that hold token values and no rule. */
export function tokenBlocks(css: string): string[] {
  return [
    tokenBlock(css),
    themeBlock(css, 'dark'),
    contrastBlock(css, 'light'),
    contrastBlock(css, 'dark'),
  ].filter(Boolean);
}

function declaredIn(block: string, name: string): string | undefined {
  return new RegExp(`(?<![\\w-])${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim();
}

/** A theme, with or without the reinforcements of `prefers-contrast: more`. */
export interface Look {
  theme: Theme;
  more: boolean;
}

export const looks: readonly Look[] = themes.flatMap((theme) => [
  { theme, more: false },
  { theme, more: true },
]);

export const describeLook = ({ theme, more }: Look) => (more ? `${theme}, more contrast` : theme);

// Later blocks win in the stylesheet, so they come first here.
function cascade(css: string, { theme, more }: Look): string[] {
  const blocks = [tokenBlock(css)];
  if (theme === 'dark') blocks.push(themeBlock(css, 'dark'));
  if (more) blocks.push(contrastBlock(css, 'light'));
  if (more && theme === 'dark') blocks.push(contrastBlock(css, 'dark'));
  return blocks.reverse();
}

/** Dark overrides what it redeclares and inherits the rest from `:root`. */
export function tokenValue(name: string, theme: Theme = 'light', more = false): string {
  const blocks = cascade(read('styles.css'), { theme, more });
  const value = blocks.map((block) => declaredIn(block, name)).find((found) => found);
  if (!value) throw new Error(`missing token ${name}`);
  return value;
}

type Rgba = [number, number, number, number];

function parseColour(value: string, look: Look): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)?.[1];
  if (hex) {
    const n = Number.parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] ? Number(rgb[4]) : 1];
  const alias = /^var\((--[a-z0-9-]+)\)$/.exec(value)?.[1];
  if (alias) return parseColour(tokenValue(alias, look.theme, look.more), look);
  const mix = /^color-mix\(in srgb, var\((--[a-z0-9-]+)\) ([\d.]+)%, transparent\)$/.exec(value);
  if (mix) {
    const [r, g, b, a] = parseColour(tokenValue(mix[1] ?? '', look.theme, look.more), look);
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

/** A ground is a token name, or a hex colour for a material the stylesheet does not declare. */
function groundColour(ground: string, look: Look): Rgba {
  const value = ground.startsWith('#') ? ground : tokenValue(ground, look.theme, look.more);
  return parseColour(value, look);
}

export function contrast(look: Look, foreground: string, ...grounds: string[]): number {
  const ground = grounds
    .map((token) => groundColour(token, look))
    .reduce((below, layer) => over(layer, below));
  const text = over(groundColour(foreground, look), ground);
  const [a, b] = [luminance(text), luminance(ground)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export type Declaration = { property: string; value: string };

export function declarations(css: string): Declaration[] {
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

export const withoutTokens = (value: string) => value.replace(/var\(\s*--[a-z0-9-]+\s*\)/gi, ' ');
