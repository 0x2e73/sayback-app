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

/** Every playable source of a note, in order: what the export keeps. */
export function playableSources(meeting: Meeting, sourceIds: readonly string[]): NoteSource[] {
  return sourceIds.flatMap((id) => {
    const at = sourceTime(meeting, id);
    return at === undefined ? [] : [{ id, at }];
  });
}

/** What a note shows: sources within the same second share one stamp. */
export function noteSources(meeting: Meeting, sourceIds: readonly string[]): NoteSource[] {
  const seconds = new Set<number>();
  return playableSources(meeting, sourceIds).filter((source) => {
    const second = Math.floor(source.at);
    if (seconds.has(second)) return false;
    seconds.add(second);
    return true;
  });
}

function formatSection(meeting: Meeting, title: string, items: NoteItem[]): string | null {
  if (!items.length) return null;
  const lines = items.map((item) => {
    const stamps = playableSources(meeting, item.sourceIds).map((source) => timeLabel(source.at));
    return stamps.length ? `- ${item.text} (${stamps.join(', ')})` : `- ${item.text}`;
  });
  return [`## ${title}`, ...lines].join('\n');
}

function noteSections(meeting: Meeting): string[] {
  if (!meeting.notes) return [];
  const { summary, keyPoints, decisions, actions, questions } = meeting.notes;
  return [
    summary.trim(),
    formatSection(meeting, 'Points clés', keyPoints),
    formatSection(meeting, 'Décisions', decisions),
    formatSection(meeting, 'Actions', actions),
    formatSection(meeting, 'À clarifier', questions),
  ].filter((section): section is string => Boolean(section));
}

/** What « Copier les notes » puts on the clipboard: everything but the transcript. */
export function notesMarkdown(meeting: Meeting): string {
  const sections = [`# ${meeting.title}`, ...noteSections(meeting)];
  if (meeting.clarifications.length) {
    const corrections = meeting.clarifications.map(
      (item) => `- [${timeLabel(item.at)}] ${item.text}`,
    );
    sections.push(['## Précisions', ...corrections].join('\n'));
  }
  return sections.join('\n\n');
}

export function meetingMarkdown(meeting: Meeting): string {
  const transcript = meeting.transcript.map((item) => {
    const speaker = speakerLabel(item);
    return `[${timeLabel(item.start)}] ${speaker ? `${speaker} : ` : ''}${item.text}`;
  });
  return [notesMarkdown(meeting), ['## Transcription', ...transcript].join('\n\n')].join('\n\n');
}
