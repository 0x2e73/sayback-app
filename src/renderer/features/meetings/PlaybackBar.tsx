import { Pause, Play } from 'lucide-react';
import { timeLabel } from '../../../shared/format';
import { Button } from '../../components/ui';
import type { Playback } from './use-media-playback';

interface PlaybackBarProps {
  playback: Playback;
  /** The video block holds the element; the bar only drives it. */
  hasVideo: boolean;
}

export function PlaybackBar({ playback, hasVideo }: PlaybackBarProps) {
  const { at, duration, playing, available, failed } = playback;
  const ratio = duration > 0 ? Math.min(1, at / duration) : 0;
  const label = playing ? 'Mettre en pause' : 'Lire';

  return (
    <div className="playback">
      {!hasVideo && <audio {...playback.mediaProps} />}
      <Button
        variant="ghost"
        shape="round"
        aria-label={label}
        title={label}
        disabled={!available}
        onClick={playback.toggle}
      >
        {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
      </Button>
      <span className="playback-time">{timeLabel(at)}</span>
      <span className="playback-progress">
        <span
          className="playback-progress-fill"
          style={{ transform: `scaleX(${ratio})` }}
          aria-hidden="true"
        />
        <input
          type="range"
          className="playback-progress-input"
          aria-label="Position de lecture"
          aria-valuetext={`${timeLabel(at)} sur ${timeLabel(duration)}`}
          min={0}
          max={duration}
          step={1}
          value={Math.min(at, duration)}
          disabled={!available}
          onChange={(event) => playback.seek(Number(event.target.value))}
        />
      </span>
      <span className="playback-time">{timeLabel(duration)}</span>
      <p className="playback-error" role="status">
        {failed ? 'Ce passage ne peut pas être lu.' : ''}
      </p>
    </div>
  );
}
