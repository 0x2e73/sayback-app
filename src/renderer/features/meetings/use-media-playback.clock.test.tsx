// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Meeting } from '../../../shared/contracts';
import { threeMinutes } from './playback-harness';
import { useMediaPlayback, type Playback } from './use-media-playback';

afterEach(cleanup);

let renders = 0;
const seen: Playback[] = [];

function Counting({ meeting }: { meeting: Meeting }) {
  const playback = useMediaPlayback(meeting);
  renders += 1;
  seen.push(playback);
  return <audio data-testid="media" {...playback.mediaProps} />;
}

it('leaves the components that do not read the clock alone while the time moves', () => {
  render(<Counting meeting={threeMinutes} />);
  const media = screen.getByTestId<HTMLAudioElement>('media');
  fireEvent.loadedMetadata(media);
  const before = renders;
  for (const time of [1, 1.25, 1.5]) {
    media.currentTime = time;
    fireEvent.timeUpdate(media);
  }
  expect(renders).toBe(before);
  expect(seen.at(-1)?.clock.now()).toBe(1.5);
});

it('keeps its actions across renders, for the memoised turns', () => {
  const { rerender } = render(<Counting meeting={threeMinutes} />);
  rerender(<Counting meeting={{ ...threeMinutes }} />);
  const [first, last] = [seen.at(-2), seen.at(-1)];
  expect(last?.playAt).toBe(first?.playAt);
  expect(last?.seek).toBe(first?.seek);
  expect(last?.toggle).toBe(first?.toggle);
});
