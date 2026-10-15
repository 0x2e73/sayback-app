// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LevelFeed } from '../../components/ui';
import {
  MISSING_SIGNAL_DELAY,
  MissingSignalNotice,
  missingSignalText,
} from './MissingSignalNotice';

let emit: (level: number) => void;
const feed: LevelFeed = {
  onLevel(listener) {
    emit = listener;
    return () => {};
  },
};
const microphone = { microphone: true, systemAudio: false };

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('announces politely that no signal arrives after ten seconds', () => {
  render(<MissingSignalNotice feed={feed} sources={microphone} />);
  act(() => vi.advanceTimersByTime(MISSING_SIGNAL_DELAY - 1));
  expect(screen.queryByRole('status')).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('status')).toHaveTextContent('Aucun son reçu du micro.');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('waits again when a signal comes back', () => {
  render(<MissingSignalNotice feed={feed} sources={microphone} />);
  act(() => vi.advanceTimersByTime(MISSING_SIGNAL_DELAY));
  act(() => emit(0.2));
  expect(screen.queryByRole('status')).toBeNull();
  act(() => vi.advanceTimersByTime(MISSING_SIGNAL_DELAY - 1));
  expect(screen.queryByRole('status')).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('status')).toBeInTheDocument();
});

it('stays quiet while a signal keeps coming', () => {
  render(<MissingSignalNotice feed={feed} sources={microphone} />);
  for (let second = 0; second < 30; second += 1) {
    act(() => emit(0.2));
    act(() => vi.advanceTimersByTime(1000));
  }
  expect(screen.queryByRole('status')).toBeNull();
});

it('names the source that is silent', () => {
  expect(missingSignalText({ microphone: true, systemAudio: false })).toBe(
    'Aucun son reçu du micro.',
  );
  expect(missingSignalText({ microphone: false, systemAudio: true })).toBe(
    'Aucun son reçu du système.',
  );
  expect(missingSignalText({ microphone: true, systemAudio: true })).toBe('Aucun son reçu.');
});
