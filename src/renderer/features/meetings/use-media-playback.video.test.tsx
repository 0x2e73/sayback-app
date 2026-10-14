// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Meeting } from '../../../shared/contracts';
import { Harness, at, click, media, renderLoaded, threeMinutes, video } from './playback-harness';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const withVideo: Meeting = { ...threeMinutes, hasVideo: true };

function renderWithVideo() {
  const view = renderLoaded(withVideo);
  fireEvent.loadedMetadata(video());
  return view;
}

it('lets the audio drive a meeting that also has a video, which follows muted', () => {
  render(<Harness meeting={withVideo} />);
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/0');
  expect(video()).toHaveAttribute('src', 'meeting-media://local/m1/video');
  expect(video().muted).toBe(true);
});

it('keeps the audio going when the video stalls', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  renderWithVideo();
  click('Lire');
  expect(play).toHaveBeenCalledTimes(2);
  media().currentTime = 20;
  fireEvent.timeUpdate(media());
  expect(at()).toBe(20);
  media().currentTime = 59;
  fireEvent.timeUpdate(media());
  fireEvent.ended(media());
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/1');
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  expect(at()).toBe(60);
});

it('plays the audio when the video cannot be read', () => {
  renderWithVideo();
  fireEvent.error(video());
  expect(screen.queryByText('Échec')).toBeNull();
  click('Lire');
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  click('2:30');
  fireEvent.loadedMetadata(media());
  expect(media().currentTime).toBe(30);
  expect(video().currentTime).toBe(0);
});

it('moves the video to every seek', () => {
  renderWithVideo();
  click('2:30');
  expect(video().currentTime).toBe(150);
  click('1:30');
  expect(video().currentTime).toBe(90);
});

it('puts a video that fell behind back on the audio', () => {
  renderWithVideo();
  click('Lire');
  video().currentTime = 4;
  media().currentTime = 20;
  fireEvent.timeUpdate(media());
  expect(video().currentTime).toBe(20);
});

it('pauses the video with the audio', () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
  renderWithVideo();
  click('Lire');
  pause.mockClear();
  click('Pause');
  expect(pause.mock.contexts).toContain(video());
});
