// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { barScale, LevelMeter, type LevelFeed } from './LevelMeter';

function fakeFeed() {
  const listeners = new Set<(level: number) => void>();
  const feed: LevelFeed = {
    onLevel: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return { feed, listeners, emit: (level: number) => listeners.forEach((l) => l(level)) };
}

afterEach(cleanup);

it('keeps every bar between a quiet floor and full height', () => {
  expect(barScale(0, 0, 4)).toBe(0.15);
  expect(barScale(1, 1, 4)).toBe(1);
  expect(barScale(0.1, 1, 4)).toBeGreaterThan(barScale(0.1, 0, 4));
});

it('raises its bars with the level, hidden from assistive technologies', () => {
  const { feed, emit } = fakeFeed();
  render(<LevelMeter feed={feed} bars={4} />);
  const meter = screen.getByTestId('level-meter');
  expect(meter).toHaveAttribute('aria-hidden', 'true');
  const bars = [...meter.children] as HTMLElement[];
  expect(bars).toHaveLength(4);
  act(() => emit(0));
  expect(bars[0]?.style.transform).toBe('scaleY(0.150)');
  act(() => emit(1));
  expect(bars[1]?.style.transform).toBe('scaleY(1.000)');
});

it('stops listening when it unmounts', () => {
  const { feed, listeners } = fakeFeed();
  const { unmount } = render(<LevelMeter feed={feed} bars={4} />);
  expect(listeners.size).toBe(1);
  unmount();
  expect(listeners.size).toBe(0);
});
