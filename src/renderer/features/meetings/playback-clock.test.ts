import { expect, it, vi } from 'vitest';
import { createPlaybackClock } from './playback-clock';

it('tells its listeners once per change of time', () => {
  const clock = createPlaybackClock(4);
  const listener = vi.fn();
  const stop = clock.subscribe(listener);
  clock.set(4);
  expect(listener).not.toHaveBeenCalled();
  clock.set(5.5);
  expect(clock.now()).toBe(5.5);
  expect(listener).toHaveBeenCalledOnce();
  stop();
  clock.set(6);
  expect(listener).toHaveBeenCalledOnce();
});

it('starts at zero', () => {
  expect(createPlaybackClock().now()).toBe(0);
});
