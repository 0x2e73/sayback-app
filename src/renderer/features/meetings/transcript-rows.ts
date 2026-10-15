import type { AudioChunk } from '../../../shared/contracts';
import type { SpeakerTone } from '../../components/ui';
import type { Turn } from './speaker-turns';

export interface PartRow {
  kind: 'part';
  key: string;
  /** 1-based, as the export names it. */
  part: number;
  start: number;
  first: boolean;
}

export interface TurnRow {
  kind: 'turn';
  key: string;
  turn: Turn;
  index: number;
  tone: SpeakerTone | null;
  labelled: boolean;
}

export type TranscriptRow = PartRow | TurnRow;

const TONES: readonly SpeakerTone[] = [1, 2, 3, 4];

function toneOf(tones: Map<string, SpeakerTone>, speaker: string | undefined): SpeakerTone | null {
  if (!speaker) return null;
  const known = tones.get(speaker);
  if (known !== undefined) return known;
  const tone = TONES[tones.size % TONES.length] ?? 1;
  tones.set(speaker, tone);
  return tone;
}

function partRow(
  turn: Turn,
  part: number,
  starts: ReadonlyMap<number, number>,
  first: boolean,
): PartRow {
  return {
    kind: 'part',
    key: `part-${turn.id}`,
    part: part + 1,
    start: starts.get(part) ?? turn.start,
    first,
  };
}

/** The transcript as shown: the turns, and a separator wherever the extract changes. */
export function transcriptRows(
  turns: readonly Turn[],
  starts: ReadonlyMap<number, number>,
): TranscriptRow[] {
  // Without any speaker the parts mean nothing to the reader: no separator at all.
  const diarized = turns.some((turn) => Boolean(turn.speaker));
  const rows: TranscriptRow[] = [];
  let tones = new Map<string, SpeakerTone>();
  let parts = 0;
  turns.forEach((turn, index) => {
    const previous = turns[index - 1];
    if (previous && turn.part !== previous.part) {
      // « A » in one part is not « A » in the next: the colours start over.
      tones = new Map();
      if (diarized && turn.part !== null) {
        rows.push(partRow(turn, turn.part, starts, parts === 0));
        parts += 1;
      }
    }
    const tone = toneOf(tones, turn.speaker);
    rows.push({
      kind: 'turn',
      key: turn.id,
      turn,
      index,
      tone,
      labelled: Boolean(turn.speaker) && !turn.continuation,
    });
  });
  return rows;
}

export function partStarts(chunks: readonly AudioChunk[]): Map<number, number> {
  return new Map(chunks.map((chunk) => [chunk.index, chunk.start]));
}

/** Turns are sorted by start (extracts in order, segments in order within each). */
export function activeTurnIndex(turns: readonly Pick<Turn, 'start' | 'end'>[], at: number): number {
  let low = 0;
  let high = turns.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const turn = turns[middle];
    if (turn && turn.start <= at) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  const turn = turns[found];
  return turn !== undefined && at < turn.end ? found : -1;
}

/** The turn a note points to: the one holding its segment, else the one playing at its time. */
export function passageTurn(
  turns: readonly Turn[],
  passage: { sourceId: string; at: number },
): number {
  const holder = turns.findIndex((turn) => turn.segmentIds.includes(passage.sourceId));
  return holder >= 0 ? holder : activeTurnIndex(turns, passage.at);
}

function sameTurn(a: Turn, b: Turn): boolean {
  return (
    a.id === b.id &&
    a.start === b.start &&
    a.end === b.end &&
    a.text === b.text &&
    a.speaker === b.speaker &&
    a.brief === b.brief &&
    a.continuation === b.continuation &&
    a.segmentIds.length === b.segmentIds.length
  );
}

/** Every unchanged turn keeps its object, and the list itself when nothing changed. */
export function stableTurns(previous: readonly Turn[], next: Turn[]): readonly Turn[] {
  const known = new Map(previous.map((turn) => [turn.id, turn]));
  let reused = 0;
  const merged = next.map((turn) => {
    const old = known.get(turn.id);
    if (!old || !sameTurn(old, turn)) return turn;
    reused += 1;
    return old;
  });
  return reused === previous.length && next.length === previous.length ? previous : merged;
}
