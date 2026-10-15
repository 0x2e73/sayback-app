import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { debounce } from './debounce';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('runs once, after the burst has been quiet for the delay', () => {
  const action = vi.fn();
  const settled = debounce(action, 250);
  settled.call();
  vi.advanceTimersByTime(200);
  settled.call();
  vi.advanceTimersByTime(200);
  expect(action).not.toHaveBeenCalled();
  vi.advanceTimersByTime(50);
  expect(action).toHaveBeenCalledOnce();
});

it('drops a pending run when cancelled', () => {
  const action = vi.fn();
  const settled = debounce(action, 250);
  settled.call();
  settled.cancel();
  vi.advanceTimersByTime(1_000);
  expect(action).not.toHaveBeenCalled();
});
