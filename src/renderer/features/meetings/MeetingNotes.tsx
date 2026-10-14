import { Sparkles } from 'lucide-react';
import type { Meeting } from '../../../shared/contracts';
import { Button } from '../../components/ui';
import { NoteSection } from './NoteSection';

interface MeetingNotesProps {
  meeting: Meeting;
  analyzing: boolean;
  onAnalyze(): void;
  onSettings(): void;
  onSeek(at: number): void;
}

function NotesEmpty({ meeting, analyzing, onAnalyze, onSettings }: MeetingNotesProps) {
  return (
    <div className="notes-empty">
      <span className="section-icon">
        <Sparkles size={23} />
      </span>
      <h2>{analyzing ? 'Votre compte rendu se prépare.' : 'Prêt pour l’analyse.'}</h2>
      <p>
        {analyzing
          ? 'La transcription apparaît progressivement. Les notes arrivent ensuite.'
          : 'Une seule action lance la transcription et le compte rendu.'}
      </p>
      {!analyzing && (
        <>
          <Button onClick={onAnalyze} disabled={!meeting.audioChunks.length}>
            <Sparkles size={16} />
            {meeting.status === 'error'
              ? 'Réessayer l’analyse'
              : 'Transcrire et créer le compte rendu'}
          </Button>
          <button className="text-link" onClick={onSettings}>
            Configurer l’analyse
          </button>
          <span className="caption">
            Les données envoyées et le coût éventuel dépendent des fournisseurs choisis dans les
            paramètres.
          </span>
        </>
      )}
    </div>
  );
}

export function MeetingNotes(props: MeetingNotesProps) {
  const { meeting, analyzing, onAnalyze, onSeek } = props;
  if (!meeting.notes) return <NotesEmpty {...props} />;
  const { summary, keyPoints, decisions, actions, questions } = meeting.notes;

  return (
    <div className="notes-content">
      <p className="summary">{summary}</p>
      <NoteSection
        title="Points clés"
        items={keyPoints}
        meeting={meeting}
        onTimestamp={(at) => onSeek(at)}
      />
      <NoteSection
        title="Décisions"
        items={decisions}
        meeting={meeting}
        onTimestamp={(at) => onSeek(at)}
      />
      <NoteSection
        title="Actions"
        items={actions}
        meeting={meeting}
        onTimestamp={(at) => onSeek(at)}
      />
      <NoteSection
        title="À clarifier"
        items={questions}
        meeting={meeting}
        onTimestamp={(at) => onSeek(at)}
      />
      <div className="notes-footer">
        <Button variant="secondary" busy={analyzing} onClick={onAnalyze}>
          <Sparkles size={15} />
          Actualiser les notes
        </Button>
        <span className="caption">Inclut vos précisions enregistrées.</span>
      </div>
    </div>
  );
}
