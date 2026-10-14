import { timeLabel } from '../../../shared/format';
import type { Meeting, NoteItem, Segment } from '../../../shared/contracts';

// Accepte un segment comme un tour de parole : les deux portent l'id d'un segment,
// dont le préfixe nomme l'extrait audio où l'intervenant a été identifié.
export function speakerLabel(spoken: Pick<Segment, 'id' | 'speaker'>): string | undefined {
  if (!spoken.speaker) return undefined;
  const chunk = Number(spoken.id.split('-')[0]);
  if (!Number.isInteger(chunk) || chunk < 0) return `Intervenant ${spoken.speaker}`;
  return `Intervenant ${spoken.speaker} · extrait ${chunk + 1}`;
}

export function sourceTime(meeting: Meeting, sourceId: string): number | undefined {
  const segment = meeting.transcript.find((item) => item.id === sourceId);
  if (segment) return segment.start;
  return meeting.clarifications.find((item) => `clarification:${item.id}` === sourceId)?.at;
}

export interface NoteSource {
  id: string;
  at: number;
}

/** Playable sources of a note, in order; sources within the same second show one stamp. */
export function noteSources(meeting: Meeting, sourceIds: readonly string[]): NoteSource[] {
  const seconds = new Set<number>();
  const sources: NoteSource[] = [];
  for (const id of sourceIds) {
    const at = sourceTime(meeting, id);
    if (at === undefined || seconds.has(Math.floor(at))) continue;
    seconds.add(Math.floor(at));
    sources.push({ id, at });
  }
  return sources;
}

function formatSection(meeting: Meeting, title: string, items: NoteItem[]): string {
  const lines = items.map((item) => {
    const timestamps = noteSources(meeting, item.sourceIds).map((source) => timeLabel(source.at));
    return `- ${item.text} (${timestamps.join(', ')})`;
  });
  return [`## ${title}`, ...lines].join('\n');
}

/** What « Copier les notes » puts on the clipboard: everything but the transcript. */
export function notesMarkdown(meeting: Meeting): string {
  const sections = [`# ${meeting.title}`];
  if (meeting.notes) {
    const { summary, keyPoints, decisions, actions, questions } = meeting.notes;
    sections.push(summary);
    sections.push(formatSection(meeting, 'Points clés', keyPoints));
    sections.push(formatSection(meeting, 'Décisions', decisions));
    sections.push(formatSection(meeting, 'Actions', actions));
    sections.push(formatSection(meeting, 'À clarifier', questions));
  }
  const corrections = meeting.clarifications.map(
    (item) => `- [${timeLabel(item.at)}] ${item.text}`,
  );
  sections.push(['## Précisions', ...corrections].join('\n'));
  return sections.join('\n\n');
}

export function meetingMarkdown(meeting: Meeting): string {
  const transcript = meeting.transcript.map((item) => {
    const speaker = speakerLabel(item);
    return `[${timeLabel(item.start)}] ${speaker ? `${speaker} : ` : ''}${item.text}`;
  });
  return [notesMarkdown(meeting), ['## Transcription', ...transcript].join('\n\n')].join('\n\n');
}
