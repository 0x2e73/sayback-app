// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createPlaybackClock, usePlaybackSelector, usePlaybackTime } from './playback-clock';

afterEach(cleanup);

function watched() {
  const clock = createPlaybackClock();
  let listeners = 0;
  return {
    clock: {
      ...clock,
      subscribe(listener: () => void) {
        listeners += 1;
        const stop = clock.subscribe(listener);
        return () => {
          listeners -= 1;
          stop();
        };
      },
    },
    listeners: () => listeners,
  };
}

function Time({ clock }: { clock: ReturnType<typeof createPlaybackClock> }) {
  return <p>{usePlaybackTime(clock)}</p>;
}

function Minute({ clock }: { clock: ReturnType<typeof createPlaybackClock> }) {
  return <p>{usePlaybackSelector(clock, (at) => Math.floor(at / 60))}</p>;
}

it('stops listening to the clock when the component goes', () => {
  const { clock, listeners } = watched();
  const { unmount } = render(<Time clock={clock} />);
  expect(listeners()).toBe(1);
  unmount();
  expect(listeners()).toBe(0);
  act(() => clock.set(5));
  expect(clock.now()).toBe(5);
});

it('follows the time, and a selection only when its value changes', () => {
  const { clock } = watched();
  render(<Minute clock={clock} />);
  act(() => clock.set(59));
  expect(screen.getByText('0')).toBeInTheDocument();
  act(() => clock.set(61));
  expect(screen.getByText('1')).toBeInTheDocument();
});
