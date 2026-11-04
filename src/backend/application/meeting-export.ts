import type { MeetingExportKind } from '../../shared/contracts';
import { meetingMarkdown, notesMarkdown, transcriptMarkdown } from '../../shared/meeting-format';
import { assertEditable } from '../domain/meeting-rules';
import type { MeetingService } from './meetings';

export interface ExportDestination {
  save(filename: string, content: string): Promise<boolean>;
}

const formats = {
  complete: { suffix: 'compte-rendu', render: meetingMarkdown },
  transcript: { suffix: 'transcription', render: transcriptMarkdown },
  notes: { suffix: 'notes', render: notesMarkdown },
};

export class MeetingExportService {
  constructor(
    private readonly meetings: Pick<MeetingService, 'get'>,
    private readonly destination: ExportDestination,
  ) {}

  async save(id: string, kind: MeetingExportKind): Promise<boolean> {
    const meeting = this.meetings.get(id);
    assertEditable(meeting);
    const hasNotes = meeting.notes !== null || meeting.clarifications.length > 0;
    const hasTranscript = meeting.transcript.length > 0;
    if (
      (kind === 'notes' && !hasNotes) ||
      (kind === 'transcript' && !hasTranscript) ||
      (!hasNotes && !hasTranscript)
    ) {
      throw new Error('Aucun contenu à exporter pour le moment.');
    }
    const format = formats[kind];
    const name =
      meeting.title
        .replace(/[^\p{L}\p{N} _-]/gu, '')
        .slice(0, 80)
        .trim() || 'reunion';
    return this.destination.save(`${name}-${format.suffix}.md`, format.render(meeting));
  }
}
