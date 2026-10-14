// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { AudioChunk } from '../../../shared/contracts';
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

it('says how far the analysis is, then how long it should last', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T12:02:00Z'));
  const meeting = meetingFixture('m1', 'Test', '2026-09-12T12:00:00Z', {
    status: 'processing',
    processingStartedAt: '2026-09-12T12:00:00Z',
    duration: 180,
    audioChunks: chunks(3, 1),
  });
  render(<AnalysisStatus meeting={meeting} />);
  expect(screen.getByRole('status')).toHaveTextContent('Analyse en cours · 1 segment sur 3');
  expect(screen.getByText(/environ 4 min/)).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(screen.getByText(/environ 6 min/)).toBeInTheDocument();
});

it('keeps the estimate out of the announced status', () => {
  const meeting = meetingFixture('m1', 'Test', '2026-09-12T12:00:00Z', {
    status: 'processing',
    processingStartedAt: new Date(Date.now() - 60_000).toISOString(),
    audioChunks: chunks(12, 3),
  });
  render(<AnalysisStatus meeting={meeting} />);
  expect(screen.getByRole('status')).toHaveTextContent(/^Analyse en cours · 3 segments sur 12$/);
});
