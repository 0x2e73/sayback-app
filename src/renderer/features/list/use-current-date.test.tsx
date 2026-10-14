// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCurrentDate } from './use-current-date';

afterEach(() => {
  vi.useRealTimers();
});

it('moves to the next day without a reload', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 14, 23, 59, 30));
  const { result } = renderHook(() => useCurrentDate());
  expect(result.current.getDate()).toBe(14);
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(result.current.getDate()).toBe(15);
});

it.each([['focus'], ['visibilitychange']])('reads the date again on %s', (eventName) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 14, 23, 0));
  const { result } = renderHook(() => useCurrentDate());
  // A laptop asleep past midnight: timers did not run, the clock did move.
  vi.setSystemTime(new Date(2026, 9, 15, 8, 0));
  act(() => {
    if (eventName === 'focus') window.dispatchEvent(new Event('focus'));
    else document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(result.current.getDate()).toBe(15);
});
