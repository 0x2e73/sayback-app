// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlaybackBar } from './PlaybackBar';
import { createPlaybackClock } from './playback-clock';
import type { MediaElementProps, Playback } from './use-media-playback';

afterEach(cleanup);

function playbackOf(extra: Partial<Playback> = {}): Playback {
  const mediaProps: MediaElementProps = {
    ref: vi.fn(),
    src: 'meeting-media://local/m1/audio/0',
    preload: 'metadata',
    onLoadedMetadata: vi.fn(),
    onTimeUpdate: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
    onEnded: vi.fn(),
    onError: vi.fn(),
  };
  return {
    available: true,
    timeline: 'audio',
    videoProps: null,
    playing: false,
    failed: false,
    clock: createPlaybackClock(252),
    duration: 3130,
    mediaProps,
    toggle: vi.fn(),
    seek: vi.fn(),
    playAt: vi.fn(),
    ...extra,
  };
}

const slider = () => screen.getByRole('slider', { name: 'Position de lecture' });

it('shows the position and the duration of the whole meeting', () => {
  render(<PlaybackBar playback={playbackOf()} />);
  expect(screen.getByText('04:12')).toBeInTheDocument();
  expect(screen.getByText('52:10')).toBeInTheDocument();
  expect(slider()).toHaveAttribute('aria-valuetext', '04:12 sur 52:10');
});

it('plays and pauses', async () => {
  const user = userEvent.setup();
  const playback = playbackOf();
  const { rerender } = render(<PlaybackBar playback={playback} />);
  await user.click(screen.getByRole('button', { name: 'Lire' }));
  expect(playback.toggle).toHaveBeenCalledOnce();
  rerender(<PlaybackBar playback={{ ...playback, playing: true }} />);
  expect(screen.getByRole('button', { name: 'Mettre en pause' })).toHaveAttribute(
    'title',
    'Mettre en pause',
  );
});

it('seeks from the progress bar', () => {
  const playback = playbackOf();
  render(<PlaybackBar playback={playback} />);
  fireEvent.change(slider(), { target: { value: '600' } });
  expect(playback.seek).toHaveBeenCalledWith(600);
});

it('says when a passage cannot be read', () => {
  render(<PlaybackBar playback={playbackOf({ failed: true })} />);
  expect(screen.getByText('Ce passage ne peut pas être lu.')).toBeInTheDocument();
});

it('cannot play without audio', () => {
  render(<PlaybackBar playback={playbackOf({ available: false })} />);
  expect(screen.getByRole('button', { name: 'Lire' })).toBeDisabled();
  expect(slider()).toBeDisabled();
});

it('leaves the element to the video block when there is a video', () => {
  const { rerender } = render(<PlaybackBar playback={playbackOf()} />);
  expect(document.querySelector('audio')).toHaveAttribute(
    'src',
    'meeting-media://local/m1/audio/0',
  );
  rerender(<PlaybackBar playback={playbackOf({ timeline: 'video' })} />);
  expect(document.querySelector('audio')).toBeNull();
});

it('seeks once, on release, however far the thumb travels', () => {
  const playback = playbackOf();
  render(<PlaybackBar playback={playback} />);
  fireEvent.pointerDown(slider());
  fireEvent.change(slider(), { target: { value: '300' } });
  fireEvent.change(slider(), { target: { value: '600' } });
  expect(playback.seek).not.toHaveBeenCalled();
  expect(screen.getByText('10:00')).toBeInTheDocument();
  fireEvent.pointerUp(slider());
  expect(playback.seek).toHaveBeenCalledOnce();
  expect(playback.seek).toHaveBeenCalledWith(600);
});

it('goes back to the playback position after a release', () => {
  const playback = playbackOf();
  render(<PlaybackBar playback={playback} />);
  fireEvent.pointerDown(slider());
  fireEvent.change(slider(), { target: { value: '600' } });
  fireEvent.pointerUp(slider());
  act(() => playback.clock.set(600));
  expect(screen.getByText('10:00')).toBeInTheDocument();
});

it('moves in fractions of a second', () => {
  render(<PlaybackBar playback={playbackOf()} />);
  expect(slider()).toHaveAttribute('step', 'any');
});

it('writes hours from the first hour on', () => {
  render(<PlaybackBar playback={playbackOf({ duration: 3700 })} />);
  expect(screen.getByText('1:01:40')).toBeInTheDocument();
  expect(slider()).toHaveAttribute('aria-valuetext', '04:12 sur 1:01:40');
});
