import { useEffect, useImperativeHandle, type Ref } from 'react';
import type { Meeting } from '../../../shared/contracts';
import { useMediaPlayback } from './use-media-playback';

export interface PlayerHandle {
  seek(at: number): void;
}

interface MediaPlayerProps {
  meeting: Meeting;
  onTime(at: number): void;
  ref?: Ref<PlayerHandle>;
}

// Bridge to the new hook until the detail is rebuilt around the player bar (Task 11).
export function MediaPlayer({ meeting, onTime, ref }: MediaPlayerProps) {
  const playback = useMediaPlayback(meeting);
  const { at, playAt } = playback;
  useImperativeHandle(ref, () => ({ seek: playAt }), [playAt]);
  useEffect(() => onTime(at), [at, onTime]);

  return (
    <div className="media-player">
      {meeting.hasVideo ? (
        <video {...playback.mediaProps} controls />
      ) : (
        <audio {...playback.mediaProps} controls />
      )}
      {!playback.available && <p className="muted">Aucun média disponible.</p>}
      {playback.failed && <p className="caption">Ce passage ne peut pas être lu.</p>}
    </div>
  );
}
