import { useState } from 'react';
import { chronoLabel } from '../../../shared/format';

interface PlaybackProgressProps {
  at: number;
  duration: number;
  disabled: boolean;
  onSeek(at: number): void;
}

/** The thumb moves freely while held; the player is asked once, on release. */
export function PlaybackProgress({ at, duration, disabled, onSeek }: PlaybackProgressProps) {
  const [dragged, setDragged] = useState<number | null>(null);
  const shown = Math.min(dragged ?? at, duration);
  const ratio = duration > 0 ? shown / duration : 0;

  function release(value: number): void {
    if (dragged === null) return;
    setDragged(null);
    onSeek(value);
  }

  function change(value: number): void {
    // Keyboard and assistive technology change the value without a pointer: seek at once.
    if (dragged === null) onSeek(value);
    else setDragged(value);
  }

  return (
    <>
      <span className="playback-time">{chronoLabel(shown)}</span>
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
          aria-valuetext={`${chronoLabel(shown)} sur ${chronoLabel(duration)}`}
          min={0}
          max={duration}
          step="any"
          value={shown}
          disabled={disabled}
          onPointerDown={(event) => setDragged(Number(event.currentTarget.value))}
          onChange={(event) => change(Number(event.target.value))}
          onPointerUp={(event) => release(Number(event.currentTarget.value))}
          onPointerCancel={() => setDragged(null)}
          onBlur={() => setDragged(null)}
        />
      </span>
    </>
  );
}
