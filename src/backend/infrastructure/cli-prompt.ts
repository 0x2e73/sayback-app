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

// Where a word starts: the start of the text, a space, an opening quote or bracket, a CJK stop.
const wordStart = '(^|[\\s"\'(\\[{<。、？！])';
const mention = new RegExp(`${wordStart}@`, 'g');
const skill = new RegExp(`${wordStart}\\$(?=[A-Za-z])`, 'g');

/**
 * A client expands `@path` (Claude Code reads the file before the model runs, whatever its tools)
 * and `$skill` (Codex loads a local SKILL.md) from the text it is given. The transcript is not ours:
 * a word-initial sigil is turned into its fullwidth form. E-mail addresses and prices are untouched.
 */
export function neutraliseSigils(text: string): string {
  return text.replace(mention, '$1＠').replace(skill, '$1＄');
}

function neutralised(meeting: Meeting): Meeting {
  return {
    ...meeting,
    title: neutraliseSigils(meeting.title),
    transcript: meeting.transcript.map((segment) => ({
      ...segment,
      text: neutraliseSigils(segment.text),
    })),
    clarifications: meeting.clarifications.map((item) => ({
      ...item,
      text: neutraliseSigils(item.text),
    })),
  };
}

/** The meeting as data, then the list of attached images in the order they are attached. */
export function cliMessage(meeting: Meeting, frames: SavedFrame[]): string {
  const parts = [`Données de la réunion (JSON) :\n${meetingContext(neutralised(meeting))}`];
  if (frames.length) {
    const lines = frames.map(
      (frame, index) => `Image ${index + 1} : écran à ${frame.at.toFixed(1)} secondes.`,
    );
    parts.push(`Images jointes, dans l’ordre :\n${lines.join('\n')}`);
  }
  return parts.join('\n\n');
}
