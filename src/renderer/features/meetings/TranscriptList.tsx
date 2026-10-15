import type { Ref } from 'react';
import type { TextRange } from '../../search-text';
import { shortTimeLabel } from './detail-format';
import type { PartRow, TranscriptRow } from './transcript-rows';
import { TranscriptTurn } from './TranscriptTurn';
import type { FoundMatches } from './use-transcript-search';

// One shared empty array: a turn without match keeps the same prop across renders.
const NO_MATCHES: readonly TextRange[] = [];

interface TranscriptListProps {
  rows: readonly TranscriptRow[];
  active: number;
  found: FoundMatches;
  onSeek(at: number): void;
  passage: { index: number; key: number };
  ref?: Ref<HTMLDivElement>;
}

function PartSeparator({ row }: { row: PartRow }) {
  return (
    <div className="transcript-part">
      <h2 className="transcript-part-title">{`Partie ${row.part} · ${shortTimeLabel(row.start)}`}</h2>
      {row.first && (
        <p className="caption">Les intervenants sont identifiés séparément dans chaque partie.</p>
      )}
    </div>
  );
}

function currentIn(found: FoundMatches, turnId: string, ranges: readonly TextRange[]): number {
  const current = found.result.matches[found.current];
  if (!current || current.turnId !== turnId) return -1;
  return ranges.findIndex((range) => range.start === current.start);
}

export function TranscriptList({ rows, active, found, onSeek, passage, ref }: TranscriptListProps) {
  return (
    <div className="transcript-turns" ref={ref}>
      {rows.map((row) => {
        if (row.kind === 'part') return <PartSeparator key={row.key} row={row} />;
        const matches = found.result.byTurn.get(row.turn.id) ?? NO_MATCHES;
        return (
          <TranscriptTurn
            key={row.key}
            turn={row.turn}
            tone={row.tone}
            labelled={row.labelled}
            active={row.index === active}
            matches={matches}
            currentMatch={currentIn(found, row.turn.id, matches)}
            onSeek={onSeek}
            passageKey={row.index === passage.index ? passage.key : 0}
          />
        );
      })}
    </div>
  );
}
