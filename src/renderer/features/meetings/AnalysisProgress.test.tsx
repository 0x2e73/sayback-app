// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Meeting } from '../../../shared/contracts';
import { AnalysisProgress } from './AnalysisProgress';

it('shows transcript progress and a measured remaining-time estimate', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-12T12:02:00Z'));
  const meeting: Meeting = {
    id: 'm1',
    title: 'Test',
    createdAt: '2026-09-12T12:00:00Z',
    status: 'processing',
    processingStartedAt: '2026-09-12T12:00:00Z',
    duration: 180,
    hasVideo: false,
    audioChunks: [
      { index: 0, start: 0, duration: 60, transcript: [] },
      { index: 1, start: 60, duration: 60, transcript: null },
      { index: 2, start: 120, duration: 60, transcript: null },
    ],
    frames: [],
    transcript: [],
    notes: null,
    clarifications: [],
    error: null,
  };
  render(<AnalysisProgress meeting={meeting} />);
  expect(screen.getByRole('status')).toHaveTextContent('1 segment sur 3');
  expect(screen.getByRole('status')).toHaveTextContent('Environ 4 min');
  vi.useRealTimers();
});
