import type { Segment } from '../../../shared/contracts';

// Au-delà, une carte devient un mur de texte : on ouvre un nouveau tour.
const maxChars = 900;
// Une relance tient sur une ligne et ne mérite pas une carte entière.
const briefSeconds = 2;
const briefChars = 25;

export interface Turn {
  id: string;
  speaker?: string;
  start: number;
  end: number;
  text: string;
  brief: boolean;
}

function chunkOf(id: string): string {
  return id.split('-')[0] ?? '';
}

// Les étiquettes d'intervenants sont attribuées extrait par extrait : « A » dans un
// extrait ne désigne pas la même personne que « A » dans le suivant.
function continues(turn: Turn, segment: Segment): boolean {
  return (
    chunkOf(turn.id) === chunkOf(segment.id) &&
    turn.speaker === segment.speaker &&
    turn.text.length + segment.text.length + 1 <= maxChars
  );
}

export function speakerTurns(transcript: Segment[]): Turn[] {
  const turns: Turn[] = [];
  for (const segment of transcript) {
    const open = turns[turns.length - 1];
    if (open && continues(open, segment)) {
      open.end = Math.max(open.end, segment.end);
      open.text = `${open.text} ${segment.text}`;
      open.brief = false;
      continue;
    }
    turns.push({
      id: segment.id,
      speaker: segment.speaker,
      start: segment.start,
      end: segment.end,
      text: segment.text,
      brief: segment.end - segment.start <= briefSeconds && segment.text.length <= briefChars,
    });
  }
  return turns;
}
