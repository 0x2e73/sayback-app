import { describe, expect, it } from 'vitest';
import { BUILD_OUTPUTS, buildProblems } from './build-output';

const complete = (path: string): string | null =>
  path.endsWith('.cjs') ? '"use strict";const e=require("electron");' : '<!doctype html>';

describe('buildProblems', () => {
  it('expects the island page and preload next to the main ones', () => {
    expect(BUILD_OUTPUTS).toContain('out/preload/island.cjs');
    expect(BUILD_OUTPUTS).toContain('out/renderer/island.html');
  });

  it('accepts a complete build', () => {
    expect(buildProblems(complete)).toEqual([]);
  });

  it('names each missing file', () => {
    const read = (path: string) => (path.includes('island') ? null : complete(path));
    expect(buildProblems(read)).toEqual([
      'out/preload/island.cjs manque',
      'out/renderer/island.html manque',
    ]);
  });

  it('refuses a preload that requires a sibling chunk', () => {
    const read = (path: string) =>
      path === 'out/preload/island.cjs' ? 'const x=require("./chunk-1.js");' : complete(path);
    expect(buildProblems(read)).toEqual([
      'out/preload/island.cjs charge un autre fichier, refusé par le bac à sable',
    ]);
  });
});
