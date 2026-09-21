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

function formatSection(meeting: Meeting, title: string, items: NoteItem[]): string {
  const lines = items.map((item) => {
    const timestamps = item.sourceIds
      .map((id) => sourceTime(meeting, id))
      .filter((at): at is number => at !== undefined)
      .map(timeLabel);
    return `- ${item.text} (${timestamps.join(', ')})`;
  });
  return [`## ${title}`, ...lines].join('\n');
}

export function meetingMarkdown(meeting: Meeting): string {
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
  const transcript = meeting.transcript.map((item) => {
    const speaker = speakerLabel(item);
    return `[${timeLabel(item.start)}] ${speaker ? `${speaker} : ` : ''}${item.text}`;
  });
  sections.push(['## Précisions', ...corrections].join('\n'));
  sections.push(['## Transcription', ...transcript].join('\n\n'));
  return sections.join('\n\n');
}
