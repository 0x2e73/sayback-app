// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { AudioChunk, Meeting } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { AnalysisStatus } from './AnalysisStatus';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const chunks = (total: number, done: number): AudioChunk[] =>
  Array.from({ length: total }, (_, index) => ({
    index,
    start: index * 60,
    duration: 60,
    transcript: index < done ? [] : null,
  }));

function processing(done: number, extra: Partial<Meeting> = {}): Meeting {
  return meetingFixture('m1', 'Test', '2026-09-12T12:00:00Z', {
    status: 'processing',
    processingStartedAt: '2026-09-12T10:00:00Z',
    duration: 720,
    audioChunks: chunks(12, done),
    ...extra,
  });
}

it('says how far the analysis is, then how long it should last once a pace is seen', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T12:00:00Z'));
  const { rerender } = render(<AnalysisStatus meeting={processing(1)} />);
  expect(screen.getByRole('status')).toHaveTextContent('Analyse en cours · 1 segment sur 12');
  // Met two hours into the run: no estimate from an age it did not watch.
  expect(screen.queryByText(/environ/)).toBeNull();
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  rerender(<AnalysisStatus meeting={processing(2)} />);
  expect(screen.queryByText(/environ/)).toBeNull();
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  rerender(<AnalysisStatus meeting={processing(3)} />);
  // The estimate shows with the next tick of the clock.
  act(() => {
    vi.advanceTimersByTime(5_000);
  });
  expect(screen.getByText(/environ 9 min/)).toBeInTheDocument();
  // The estimate stays out of the announced status.
  expect(screen.getByRole('status')).toHaveTextContent(/^Analyse en cours · 3 segments sur 12$/);
});
