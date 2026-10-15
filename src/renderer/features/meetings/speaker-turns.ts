import type { Segment } from '../../../shared/contracts';

// Au-delà, un tour devient un mur de texte : on ouvre une suite sans nouvelle étiquette.
const maxChars = 900;
// Une relance tient sur une ligne.
const briefSeconds = 2;
const briefChars = 25;

export interface Turn {
  id: string;
  /** Index of the audio extract where the speaker was identified; null for an id without one. */
  part: number | null;
  speaker?: string;
  start: number;
  end: number;
  text: string;
  brief: boolean;
  /** The same voice cut at 900 characters: shown without a new label. */
  continuation: boolean;
  segmentIds: string[];
}

export function partOf(id: string): number | null {
  const head = id.split('-')[0] ?? '';
  return /^\d+$/.test(head) ? Number(head) : null;
}

// Les étiquettes d'intervenants sont attribuées extrait par extrait : « A » dans un
// extrait ne désigne pas la même personne que « A » dans le suivant.
function sameVoice(turn: Turn, segment: Segment): boolean {
  return turn.part === partOf(segment.id) && turn.speaker === segment.speaker;
}

function opened(segment: Segment, continuation: boolean): Turn {
  return {
    id: segment.id,
    part: partOf(segment.id),
    speaker: segment.speaker,
    start: segment.start,
    end: segment.end,
    text: segment.text,
    brief: segment.end - segment.start <= briefSeconds && segment.text.length <= briefChars,
    continuation,
    segmentIds: [segment.id],
  };
}

export function speakerTurns(transcript: readonly Segment[]): Turn[] {
  const turns: Turn[] = [];
  for (const segment of transcript) {
    const open = turns[turns.length - 1];
    const same = open !== undefined && sameVoice(open, segment);
    if (open && same && open.text.length + segment.text.length + 1 <= maxChars) {
      open.end = Math.max(open.end, segment.end);
      open.text = `${open.text} ${segment.text}`;
      open.brief = false;
      open.segmentIds.push(segment.id);
      continue;
    }
    turns.push(opened(segment, same));
  }
  return turns;
}
