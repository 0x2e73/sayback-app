// Shared by the playback hook tests.
import { fireEvent, render, screen } from '@testing-library/react';
import type { AudioChunk, Meeting } from '../../../shared/contracts';
import { meetingFixture } from '../../test-api';
import { useMediaPlayback } from './use-media-playback';

export const chunk = (index: number, start: number, duration = 60): AudioChunk => ({
  index,
  start,
  duration,
  transcript: null,
});
export const threeMinutes = meetingFixture('m1', 'Revue', '2026-10-14T08:00:00Z', {
  duration: 180,
  audioChunks: [chunk(0, 0), chunk(1, 60), chunk(2, 120)],
});

export function Harness({ meeting }: { meeting: Meeting }) {
  const playback = useMediaPlayback(meeting);
  return (
    <>
      <audio data-testid="media" {...playback.mediaProps} />
      {playback.videoProps && <video data-testid="video" {...playback.videoProps} />}
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

export const media = () => screen.getByTestId<HTMLAudioElement>('media');
export const video = () => screen.getByTestId<HTMLVideoElement>('video');
export const at = () => Number(screen.getByTestId('at').textContent);
export const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

export function renderLoaded(meeting: Meeting = threeMinutes) {
  const view = render(<Harness meeting={meeting} />);
  fireEvent.loadedMetadata(media());
  return view;
}
