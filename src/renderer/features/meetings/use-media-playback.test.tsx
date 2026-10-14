// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AudioChunk, Meeting } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { useMediaPlayback } from './use-media-playback';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const chunk = (index: number, start: number, duration = 60): AudioChunk => ({
  index,
  start,
  duration,
  transcript: null,
});
const threeMinutes = meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z', {
  duration: 180,
  audioChunks: [chunk(0, 0), chunk(1, 60), chunk(2, 120)],
});

function Harness({ meeting }: { meeting: Meeting }) {
  const playback = useMediaPlayback(meeting);
  return (
    <>
      <audio data-testid="media" {...playback.mediaProps} />
      <p data-testid="at">{playback.at}</p>
      <p data-testid="duration">{playback.duration}</p>
      {playback.failed && <p>Échec</p>}
      <button onClick={playback.toggle}>{playback.playing ? 'Pause' : 'Lire'}</button>
      <button onClick={() => playback.playAt(150)}>2:30</button>
      <button onClick={() => playback.seek(90)}>1:30</button>
      <button onClick={() => playback.seek(30)}>0:30</button>
    </>
  );
}

const media = () => screen.getByTestId<HTMLAudioElement>('media');
const at = () => Number(screen.getByTestId('at').textContent);
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

function renderLoaded(meeting: Meeting = threeMinutes) {
  const view = render(<Harness meeting={meeting} />);
  fireEvent.loadedMetadata(media());
  return view;
}

it('plays the extracts one after the other as one timeline', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  renderLoaded();
  click('Lire');
  media().currentTime = 59;
  fireEvent.timeUpdate(media());
  expect(at()).toBe(59);
  fireEvent.ended(media());
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/1');
  expect(at()).toBe(60);
  expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  fireEvent.loadedMetadata(media());
  expect(media().currentTime).toBe(0);
  expect(play).toHaveBeenCalledTimes(2);
  media().currentTime = 12;
  fireEvent.timeUpdate(media());
  expect(at()).toBe(72);
});

it('stops at the end of the last extract and starts over from the beginning', () => {
  renderLoaded();
  click('2:30');
  fireEvent.loadedMetadata(media());
  fireEvent.ended(media());
  expect(at()).toBe(180);
  expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
  click('Lire');
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/0');
  expect(at()).toBe(0);
});

it('waits for an extract that is not loaded before seeking into it', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  renderLoaded();
  click('2:30');
  expect(at()).toBe(150);
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/2');
  expect(play).not.toHaveBeenCalled();
  media().currentTime = 0;
  fireEvent.timeUpdate(media());
  expect(at()).toBe(150);
  fireEvent.loadedMetadata(media());
  expect(media().currentTime).toBe(30);
  expect(play).toHaveBeenCalledOnce();
});

it('seeks from the bar without starting playback', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  renderLoaded();
  click('1:30');
  fireEvent.loadedMetadata(media());
  expect(media().currentTime).toBe(30);
  expect(play).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
});

it('stays paused when the person pauses while the next extract loads', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  renderLoaded();
  click('Lire');
  fireEvent.ended(media());
  click('Pause');
  fireEvent.loadedMetadata(media());
  expect(play).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
});

it('says an extract cannot be read and resumes after it', () => {
  renderLoaded();
  click('1:30');
  fireEvent.error(media());
  expect(screen.getByText('Échec')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
  click('Lire');
  expect(screen.queryByText('Échec')).toBeNull();
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/2');
  expect(at()).toBe(120);
});

it('fetches a failed extract again when the person seeks back into it', () => {
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load');
  renderLoaded();
  fireEvent.error(media());
  click('0:30');
  expect(load).toHaveBeenCalledOnce();
  expect(screen.queryByText('Échec')).toBeNull();
  fireEvent.loadedMetadata(media());
  expect(media().currentTime).toBe(30);
});

it('keeps the source and the position when the poll refreshes the same meeting', () => {
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load');
  const { rerender } = renderLoaded();
  click('2:30');
  fireEvent.loadedMetadata(media());
  media().currentTime = 40;
  fireEvent.timeUpdate(media());
  const refreshed: Meeting = {
    ...threeMinutes,
    status: 'processing',
    audioChunks: threeMinutes.audioChunks.map((item) => ({ ...item, transcript: [] })),
  };
  rerender(<Harness meeting={refreshed} />);
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/2');
  expect(media().currentTime).toBe(40);
  expect(at()).toBe(160);
  expect(load).not.toHaveBeenCalled();
});

it('orders the extracts by time and measures the whole meeting', () => {
  render(
    <Harness
      meeting={{
        ...threeMinutes,
        duration: 181.5,
        audioChunks: [chunk(2, 120), chunk(0, 0), chunk(1, 60)],
      }}
    />,
  );
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/0');
  expect(screen.getByTestId('duration')).toHaveTextContent('181.5');
});

it('drives the video as one source', () => {
  render(<Harness meeting={{ ...threeMinutes, hasVideo: true }} />);
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/video');
});

it('has nothing to play without audio', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  render(<Harness meeting={meetingFixture('m2', 'Vide', '2026-10-14T08:00:00Z')} />);
  expect(media()).not.toHaveAttribute('src');
  click('Lire');
  expect(play).not.toHaveBeenCalled();
});

it('stops the sound when the player goes away', () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
  const { unmount } = renderLoaded();
  click('Lire');
  unmount();
  expect(pause).toHaveBeenCalled();
});

it('keeps only the last seek made while an extract loads', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  renderLoaded();
  click('2:30');
  click('1:30');
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/1');
  fireEvent.loadedMetadata(media());
  expect(media().currentTime).toBe(30);
  expect(at()).toBe(90);
  expect(play).toHaveBeenCalledOnce();
});

it('resumes after an extract that fails during the hand-over', () => {
  renderLoaded();
  click('Lire');
  fireEvent.ended(media());
  fireEvent.error(media());
  expect(screen.getByText('Échec')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
  click('Lire');
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m1/audio/2');
  expect(at()).toBe(120);
});

it('tries the last extract again when it is the one that failed', () => {
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load');
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  renderLoaded();
  click('2:30');
  fireEvent.loadedMetadata(media());
  fireEvent.error(media());
  click('Lire');
  expect(load).toHaveBeenCalledOnce();
  fireEvent.loadedMetadata(media());
  expect(media().currentTime).toBe(30);
  expect(play).toHaveBeenCalledTimes(2);
});

it('opens the next meeting from the start, paused, once the first one is gone', () => {
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause');
  const other = meetingFixture('m2', 'Point', '2026-10-14T09:00:00Z', {
    duration: 120,
    audioChunks: [chunk(0, 0), chunk(1, 60)],
  });
  const { rerender } = renderLoaded();
  click('2:30');
  fireEvent.loadedMetadata(media());
  rerender(<Harness key="m2" meeting={other} />);
  expect(pause).toHaveBeenCalled();
  expect(media()).toHaveAttribute('src', 'meeting-media://local/m2/audio/0');
  expect(at()).toBe(0);
  expect(screen.getByRole('button', { name: 'Lire' })).toBeInTheDocument();
});

it('does not play a queued extract after the player went away mid-load', () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play');
  const { unmount } = renderLoaded();
  const element = media();
  click('2:30');
  unmount();
  fireEvent.loadedMetadata(element);
  expect(play).not.toHaveBeenCalled();
});
