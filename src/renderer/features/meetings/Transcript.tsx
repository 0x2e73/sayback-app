import { useEffect, useMemo, useRef } from 'react';
import { Search } from 'lucide-react';
import type { Meeting, MeetingStatus } from '../../../shared/contracts';
import { speakerTurns, type Turn } from './speaker-turns';
import { TranscriptTurn } from './TranscriptTurn';

/** The search is owned by the tab container, so it survives a change of tab. */
export interface TranscriptSearch {
  search: string;
  onSearch(value: string): void;
}

interface TranscriptProps extends TranscriptSearch {
  meeting: Meeting;
  at: number;
  onSeek(at: number): void;
}

function matching(turns: Turn[], search: string): Turn[] {
  const wanted = search.trim().toLowerCase();
  if (!wanted) return turns;
  return turns.filter((turn) => turn.text.toLowerCase().includes(wanted));
}

function TranscriptEmpty({ status }: { status: MeetingStatus }) {
  return (
    <p className="muted">
      {status === 'processing'
        ? 'La transcription arrive au fur et à mesure de l’analyse.'
        : 'La transcription commence avec la génération du compte rendu, depuis l’onglet Notes.'}
    </p>
  );
}

export function Transcript({ meeting, at, onSeek, search, onSearch }: TranscriptProps) {
  const playing = useRef<HTMLButtonElement>(null);
  const turns = useMemo(() => speakerTurns(meeting.transcript), [meeting.transcript]);
  const shown = useMemo(() => matching(turns, search), [turns, search]);
  const current = turns.find((turn) => at >= turn.start && at < turn.end)?.id;

  // Suit la lecture sans contrarier un défilement manuel : ne bouge que si le
  // passage en cours est hors de vue.
  useEffect(() => {
    playing.current?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  if (!meeting.transcript.length) return <TranscriptEmpty status={meeting.status} />;

  return (
    <div className="transcript">
      <label className="search">
        <Search size={16} />
        <input
          type="search"
          value={search}
          placeholder="Chercher dans la transcription…"
          aria-label="Chercher dans la transcription"
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>
      <div className="transcript-turns">
        {shown.map((turn) => (
          <TranscriptTurn
            key={turn.id}
            turn={turn}
            active={turn.id === current}
            onSeek={onSeek}
            ref={turn.id === current ? playing : undefined}
          />
        ))}
        {!shown.length && <p className="muted">Aucun passage ne contient ce texte.</p>}
      </div>
    </div>
  );
}
