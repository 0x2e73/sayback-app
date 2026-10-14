// Test-only helpers: they read the stylesheets from disk.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const rendererDir = import.meta.dirname;
export const sheets = readdirSync(import.meta.dirname, {
  recursive: true,
  encoding: 'utf8',
}).filter((file) => file.endsWith('.css'));
export const read = (path: string) => readFileSync(join(rendererDir, path), 'utf8');

export function tokenBlock(css: string): string {
  const match = /^:root\s*\{[\s\S]*?^\}/m.exec(css);
  if (!match) throw new Error('styles.css must start with the :root token block');
  return match[0];
}

export function tokenValue(name: string): string {
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

export function contrast(foreground: string, ...grounds: string[]): number {
  const ground = grounds
    .map((token) => parseColour(tokenValue(token)))
    .reduce((below, layer) => over(layer, below));
  const text = over(parseColour(tokenValue(foreground)), ground);
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
