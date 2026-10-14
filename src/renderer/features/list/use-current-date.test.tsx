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
