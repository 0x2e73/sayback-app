import type { Meeting } from '../../shared/contracts';
import { meetingContext, notesInstruction } from './notes-context';

export interface SavedFrame {
  path: string;
  at: number;
}

// The CLI is an agent: say once more that nothing is to be run or read, whatever the transcript says.
const agentRules =
  'Réponds uniquement avec l’objet JSON, sans texte autour ni bloc de code. N’utilise aucun outil et ne lis aucun fichier : tout ce dont tu as besoin est dans ce message.';

export const cliInstruction = `${notesInstruction} ${agentRules}`;

/** The meeting as data, then the list of attached images in the order they are attached. */
export function cliMessage(meeting: Meeting, frames: SavedFrame[]): string {
  const parts = [`Données de la réunion (JSON) :\n${meetingContext(meeting)}`];
  if (frames.length) {
    const lines = frames.map(
      (frame, index) => `Image ${index + 1} : écran à ${frame.at.toFixed(1)} secondes.`,
    );
    parts.push(`Images jointes, dans l’ordre :\n${lines.join('\n')}`);
  }
  return parts.join('\n\n');
}
