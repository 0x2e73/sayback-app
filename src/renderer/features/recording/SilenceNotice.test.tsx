// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LevelFeed } from '../../components/ui';
import { SILENCE_DELAY, SilenceNotice } from './SilenceNotice';

let emit: (level: number) => void;
const feed: LevelFeed = {
  onLevel(listener) {
    emit = listener;
    return () => {};
  },
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('warns after ten seconds without sound', () => {
  render(<SilenceNotice feed={feed} />);
  act(() => vi.advanceTimersByTime(SILENCE_DELAY - 1));
  expect(screen.queryByText('Aucun son détecté. Vérifiez votre micro.')).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('alert')).toHaveTextContent('Aucun son détecté. Vérifiez votre micro.');
});

it('waits again when sound comes back', () => {
  render(<SilenceNotice feed={feed} />);
  act(() => vi.advanceTimersByTime(SILENCE_DELAY));
  act(() => emit(0.2));
  expect(screen.queryByRole('alert')).toBeNull();
  act(() => vi.advanceTimersByTime(SILENCE_DELAY - 1));
  expect(screen.queryByRole('alert')).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('alert')).toBeInTheDocument();
});

it('stays quiet while the voice keeps coming', () => {
  render(<SilenceNotice feed={feed} />);
  for (let second = 0; second < 30; second += 1) {
    act(() => emit(0.2));
    act(() => vi.advanceTimersByTime(1000));
  }
  expect(screen.queryByRole('alert')).toBeNull();
});
