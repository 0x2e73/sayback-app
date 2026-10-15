import { Pause, Play } from 'lucide-react';
import { chronoLabel } from '../../../shared/format';
import { Button, IconSwap } from '../../components/ui';
import { usePlaybackTime } from './playback-clock';
import { PlaybackProgress } from './PlaybackProgress';
import type { Playback } from './use-media-playback';

interface PlaybackBarProps {
  playback: Playback;
}

export function PlaybackBar({ playback }: PlaybackBarProps) {
  const { duration, playing, available, failed } = playback;
  const at = usePlaybackTime(playback.clock);
  const label = playing ? 'Mettre en pause' : 'Lire';

  return (
    <div className="playback">
      {/* The video block holds the element when the video alone has the sound. */}
      {playback.timeline === 'audio' && <audio {...playback.mediaProps} />}
      <Button
        variant="ghost"
        shape="round"
        aria-label={label}
        title={label}
        disabled={!available}
        onClick={playback.toggle}
      >
        <IconSwap active={playing} on={<Pause size={16} />} off={<Play size={16} />} />
      </Button>
      <PlaybackProgress at={at} duration={duration} disabled={!available} onSeek={playback.seek} />
      <span className="playback-time">{chronoLabel(duration)}</span>
      <p className="playback-error" role="status">
        {failed ? 'Ce passage ne peut pas être lu.' : ''}
      </p>
    </div>
  );
}
