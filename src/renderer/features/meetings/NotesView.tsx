import type { Meeting } from '../../../shared/contracts';
import { Button, Skeleton } from '../../components/ui';
import { AnalysisPrompt } from './AnalysisPrompt';
import { Clarifications, type TimestampHandler } from './Clarifications';
import { NoteSection } from './NoteSection';

interface NotesViewProps {
  meeting: Meeting;
  currentTime(): number;
  analyzing: boolean;
  saving: boolean;
  clarifyError: string;
  onAnalyze(): void;
  onSettings(): void;
  onTimestamp: TimestampHandler;
  onClarify(at: number, text: string): Promise<boolean>;
}

function NotesSkeleton() {
  return (
    <div className="notes-skeleton" aria-hidden="true">
      <Skeleton />
      <Skeleton />
      <Skeleton short />
    </div>
  );
}

function NotesBody({ meeting, analyzing, onAnalyze, onSettings, onTimestamp }: NotesViewProps) {
  const notes = meeting.notes;
  if (!notes) {
    if (analyzing) return <NotesSkeleton />;
    // A failed analysis speaks through the amber band above the tabs.
    if (meeting.status === 'error') return null;
    return (
      <AnalysisPrompt
        canAnalyze={meeting.audioChunks.length > 0}
        onAnalyze={onAnalyze}
        onSettings={onSettings}
      />
    );
  }
  const summary = notes.summary.trim();
  const section = { meeting, onTimestamp };
  return (
    <>
      {summary && (
        <section className="note-section">
          <h2>Résumé</h2>
          <p className="note-summary">{summary}</p>
        </section>
      )}
      <NoteSection title="Points clés" items={notes.keyPoints} {...section} />
      <NoteSection title="Décisions" items={notes.decisions} {...section} />
      <NoteSection title="Actions" items={notes.actions} {...section} />
      <NoteSection title="À clarifier" items={notes.questions} {...section} />
      <div className="notes-refresh">
        <Button variant="secondary" busy={analyzing} onClick={onAnalyze}>
          Actualiser les notes
        </Button>
        <span className="caption">Inclut vos précisions enregistrées.</span>
      </div>
    </>
  );
}

export function NotesView(props: NotesViewProps) {
  return (
    <div className="notes-view">
      <NotesBody {...props} />
      <Clarifications
        meeting={props.meeting}
        currentTime={props.currentTime}
        disabled={props.analyzing}
        saving={props.saving}
        submitError={props.clarifyError}
        onTimestamp={props.onTimestamp}
        onSubmit={props.onClarify}
      />
    </div>
  );
}
