import type { Ref } from 'react';
import { timeLabel } from '../../../shared/format';
import { speakerName } from './meeting-format';
import type { Turn } from './speaker-turns';

interface TranscriptTurnProps {
  turn: Turn;
  active: boolean;
  onSeek(at: number): void;
  ref?: Ref<HTMLButtonElement>;
}

export function TranscriptTurn({ turn, active, onSeek, ref }: TranscriptTurnProps) {
  const label = turn.speaker ? speakerName(turn.speaker) : undefined;
  const classes = ['transcript-turn', turn.brief ? 'brief' : '', active ? 'active' : ''];

  return (
    <button
      ref={ref}
      className={classes.filter(Boolean).join(' ')}
      aria-current={active ? 'true' : undefined}
      onClick={() => onSeek(turn.start)}
    >
      <time>{timeLabel(turn.start)}</time>
      <span>
        {label && <strong>{label}</strong>}
        {turn.text}
      </span>
    </button>
  );
}
