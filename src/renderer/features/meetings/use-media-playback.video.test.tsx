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

it('pauses the audio when the person pauses the video, without a loop', () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
  renderWithVideo();
  click('Lire');
  pause.mockClear();
  fireEvent.pause(video());
  expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
  expect(pause.mock.contexts.filter((element) => element === media())).toHaveLength(1);
});

it('resumes the audio when the person plays the video again', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  renderWithVideo();
  fireEvent.play(video());
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  expect(play.mock.contexts).toContain(media());
});

it('does not pause the audio for the pause the follower makes itself', () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
  renderWithVideo();
  click('Lire');
  click('Pause');
  pause.mockClear();
  expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
  click('Lire');
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  expect(pause).not.toHaveBeenCalled();
});

it('leaves the audio alone when the video reaches its end before the audio', () => {
  renderWithVideo();
  click('Lire');
  video().dispatchEvent(new Event('ended'));
  Object.defineProperty(video(), 'ended', { configurable: true, get: () => true });
  fireEvent.pause(video());
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
});
