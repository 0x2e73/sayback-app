import { describe, expect, it } from 'vitest';
import type { AudioChunk } from '../../../shared/contracts';
import {
  analysisLabel,
  analysisProgress,
  analysisRatio,
  remainingLabel,
} from './analysis-progress';

function chunks(total: number, done: number): AudioChunk[] {
  return Array.from({ length: total }, (_, index) => ({
    index,
    start: index * 60,
    duration: 60,
    transcript: index < done ? [] : null,
  }));
}

const now = Date.parse('2026-09-12T12:02:00Z');
const started = '2026-09-12T12:00:00Z';

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

  it('counts transcribed segments and estimates the rest from the measured pace', () => {
    const meeting = { audioChunks: chunks(3, 1), processingStartedAt: started };
    expect(analysisLabel(meeting)).toBe('Analyse en cours · 1 segment sur 3');
    expect(remainingLabel(meeting, now)).toBe('environ 4 min');
  });

  it.each([
    ['before the first segment', chunks(12, 0), started, null],
    ['while the notes are written', chunks(12, 12), started, null],
    ['without a start time', chunks(3, 1), undefined, null],
    ['with an unreadable start time', chunks(2, 1), 'nope', null],
    ['with a start ahead of the clock', chunks(3, 1), '2026-09-12T12:05:00Z', 'environ 1 min'],
    ['after a few seconds', chunks(12, 1), '2026-09-12T12:01:50Z', 'environ 2 min'],
  ])('estimates %s', (_case, audioChunks, processingStartedAt, label) => {
    expect(remainingLabel({ audioChunks, processingStartedAt }, now)).toBe(label);
  });
});
