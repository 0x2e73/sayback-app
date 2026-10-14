// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoBlock } from './VideoBlock';
import type { MediaElementProps, Playback } from './use-media-playback';

const requestFullscreen = vi.fn(() => Promise.resolve());

beforeAll(() => {
  // jsdom has no fullscreen API.
  HTMLVideoElement.prototype.requestFullscreen = requestFullscreen;
});

afterEach(() => {
  cleanup();
  requestFullscreen.mockClear();
  Reflect.deleteProperty(document, 'fullscreenElement');
});

function mediaProps(extra: Partial<MediaElementProps> = {}): MediaElementProps {
  return {
    ref: vi.fn(),
    src: 'meeting-media://local/m1/video',
    preload: 'metadata',
    onLoadedMetadata: vi.fn(),
    onTimeUpdate: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onEnded: vi.fn(),
    onError: vi.fn(),
    ...extra,
  };
}

function playbackOf(
  extra: Partial<MediaElementProps> = {},
): Pick<Playback, 'mediaProps' | 'videoProps'> {
  return { mediaProps: mediaProps(extra), videoProps: null };
}

function video(): HTMLVideoElement {
  const element = document.querySelector('video');
  if (!element) throw new Error('no video element');
  return element;
}

it('shows the video the footer bar drives, without its own controls', () => {
  render(<VideoBlock playback={playbackOf()} />);
  expect(video()).toHaveAttribute('src', 'meeting-media://local/m1/video');
  expect(video()).not.toHaveAttribute('controls');
});

it('hands the video element to the playback driver', () => {
  const ref = vi.fn();
  render(<VideoBlock playback={playbackOf({ ref })} />);
  expect(ref).toHaveBeenCalledWith(video());
});

it('opens the video itself in full screen from a labelled button', async () => {
  const user = userEvent.setup();
  render(<VideoBlock playback={playbackOf()} />);
  await user.click(screen.getByRole('button', { name: 'Plein écran' }));
  expect(requestFullscreen).toHaveBeenCalledOnce();
  expect(requestFullscreen.mock.contexts[0]).toBe(video());
});

it('gives the video its own controls only while it fills the screen', () => {
  render(<VideoBlock playback={playbackOf()} />);
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => video(),
  });
  fireEvent(video(), new Event('fullscreenchange'));
  expect(video()).toHaveAttribute('controls');
  Reflect.deleteProperty(document, 'fullscreenElement');
  fireEvent(video(), new Event('fullscreenchange'));
  expect(video()).not.toHaveAttribute('controls');
});

it('follows the audio muted, with native controls only in full screen', () => {
  const ref = vi.fn();
  render(
    <VideoBlock
      playback={{
        mediaProps: mediaProps(),
        videoProps: {
          ref,
          src: 'meeting-media://local/m1/video',
          preload: 'metadata',
          muted: true,
          onLoadedMetadata: vi.fn(),
          onError: vi.fn(),
          onPlay: vi.fn(),
          onPause: vi.fn(),
        },
      }}
    />,
  );
  expect(ref).toHaveBeenCalledWith(video());
  expect(video().muted).toBe(true);
  expect(video()).not.toHaveAttribute('controls');
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => video(),
  });
  fireEvent(video(), new Event('fullscreenchange'));
  expect(video()).toHaveAttribute('controls');
  Reflect.deleteProperty(document, 'fullscreenElement');
  fireEvent(video(), new Event('fullscreenchange'));
  expect(video()).not.toHaveAttribute('controls');
});
