import { memo, type ReactNode } from 'react';
import { Play } from 'lucide-react';
import { SpeakerLabel, type SpeakerTone } from '../../components/ui';
import type { TextRange } from '../../search-text';
import { shortTimeLabel } from './detail-format';
import { speakerName } from './meeting-format';
import type { Turn } from './speaker-turns';

interface TranscriptTurnProps {
  turn: Turn;
  tone: SpeakerTone | null;
  labelled: boolean;
  active: boolean;
  matches: readonly TextRange[];
  /** Index in `matches` of the current search result, −1 when it is elsewhere. */
  currentMatch: number;
  onSeek(at: number): void;
  /** 0 when this is not the passage reached from a note; a new value replays the flash. */
  passageKey: number;
}

function highlighted(text: string, matches: readonly TextRange[], current: number): ReactNode[] {
  const pieces: ReactNode[] = [];
  let from = 0;
  matches.forEach((range, index) => {
    if (range.start > from) pieces.push(text.slice(from, range.start));
    pieces.push(
      <mark key={range.start} aria-current={index === current ? 'true' : undefined}>
        {text.slice(range.start, range.end)}
      </mark>,
    );
    from = range.end;
  });
  if (from < text.length) pieces.push(text.slice(from));
  return pieces;
}

function turnClass(turn: Turn): string {
  const classes = ['transcript-turn'];
  if (turn.brief) classes.push('is-brief');
  if (turn.continuation) classes.push('is-continuation');
  return classes.join(' ');
}

function TranscriptTurnView(props: TranscriptTurnProps) {
  const { turn, tone, labelled, active, matches, currentMatch, onSeek, passageKey } = props;
  const time = shortTimeLabel(turn.start);
  return (
    <article
      className={turnClass(turn)}
      data-turn={turn.id}
      aria-current={active ? 'time' : undefined}
      data-passage={passageKey > 0 ? '' : undefined}
    >
      {passageKey > 0 && (
        <span key={passageKey} className="transcript-turn-flash" aria-hidden="true" />
      )}
      {/* The only seek trigger: the text stays free for selection. */}
      <button
        type="button"
        className="transcript-time"
        aria-label={`Lire à partir de ${time}`}
        onClick={() => onSeek(turn.start)}
      >
        <time>{time}</time>
        <Play size={12} aria-hidden="true" />
      </button>
      <div className="transcript-body">
        {labelled && turn.speaker && tone && (
          <SpeakerLabel name={speakerName(turn.speaker)} tone={tone} />
        )}
        <p className="transcript-text">{highlighted(turn.text, matches, currentMatch)}</p>
      </div>
    </article>
  );
}

/** Memoised: a poll, a tick of the clock or a keystroke re-renders only the turns it changes. */
export const TranscriptTurn = memo(TranscriptTurnView);
