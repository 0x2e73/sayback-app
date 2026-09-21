import { timeLabel } from '../../../shared/format';
import { forwardRef } from 'react';
import type { Meeting } from '../../../shared/contracts';

import { useMediaPlayback, type PlayerHandle } from './use-media-playback';

export type { PlayerHandle } from './use-media-playback';
interface MediaPlayerProps {
  meeting: Meeting;
  onTime(at: number): void;
}
interface MediaContentProps {
  meeting: Meeting;
  playback: ReturnType<typeof useMediaPlayback>;
}

function MediaContent({ meeting, playback }: MediaContentProps) {
  if (meeting.hasVideo) {
    return <video {...playback.mediaProps} src={`meeting-media://local/${meeting.id}/video`} />;
  }
  if (!playback.chunk) return <p className="muted">Aucun média disponible.</p>;

  return (
    <>
      <label className="field">
        Passage audio
        <select
          value={playback.chunkIndex}
          onChange={(event) => playback.selectChunk(Number(event.target.value))}
        >
          {meeting.audioChunks.map((chunk, index) => (
            <option value={index} key={chunk.index}>
              {timeLabel(chunk.start)} – {timeLabel(chunk.start + chunk.duration)}
            </option>
          ))}
        </select>
      </label>
      <audio
        {...playback.mediaProps}
        src={`meeting-media://local/${meeting.id}/audio/${playback.chunk.index}`}
      />
    </>
  );
}

export const MediaPlayer = forwardRef<PlayerHandle, MediaPlayerProps>(function MediaPlayer(
  { meeting, onTime },
  ref,
) {
  const playback = useMediaPlayback(meeting, onTime, ref);
  return (
    <div className="media-player">
      <MediaContent meeting={meeting} playback={playback} />
      {playback.error && (
        <p className="caption">
          Ce passage ne peut pas être lu. Les fichiers restent accessibles dans les paramètres.
        </p>
      )}
    </div>
  );
});
