import { describe, expect, it } from 'vitest';
import type { AudioChunk } from '../../../shared/contracts';
import { analysisLabel, analysisProgress, analysisRatio } from './analysis-progress';

function chunks(total: number, done: number): AudioChunk[] {
  return Array.from({ length: total }, (_, index) => ({
    index,
    start: index * 60,
    duration: 60,
    transcript: index < done ? [] : null,
  }));
}

describe('analysis progress', () => {
  it('counts the transcribed segments', () => {
    expect(analysisProgress({ audioChunks: chunks(12, 3) })).toEqual({ done: 3, total: 12 });
    expect(analysisRatio({ audioChunks: chunks(12, 3) })).toBe(0.25);
    expect(analysisRatio({ audioChunks: [] })).toBe(0);
  });

  it.each([
    [12, 3, 'Analyse en cours · 3 segments sur 12'],
    [3, 1, 'Analyse en cours · 1 segment sur 3'],
    [12, 0, 'Analyse en cours · 0 segment sur 12'],
    [12, 12, 'Analyse en cours · rédaction du compte rendu'],
    [0, 0, 'Analyse en cours'],
  ])('labels %s segments with %s done', (total, done, label) => {
    expect(analysisLabel({ audioChunks: chunks(total, done) })).toBe(label);
  });
});
