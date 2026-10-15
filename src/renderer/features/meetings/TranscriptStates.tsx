import { Sparkles } from 'lucide-react';
import { Button, EmptyState, Skeleton } from '../../components/ui';

// Distinct from the notes prompt's id: both panels can be in the DOM at once.
const NO_AUDIO_ID = 'transcript-no-audio';

// Static: skeletons never animate.
export function TranscriptWaiting() {
  return (
    <div className="transcript-waiting">
      <p className="caption">La transcription arrive au fur et à mesure.</p>
      <Skeleton />
      <Skeleton />
      <Skeleton />
      <Skeleton short />
    </div>
  );
}

interface TranscriptEmptyProps {
  canAnalyze: boolean;
  onAnalyze(): void;
}

export function TranscriptEmpty({ canAnalyze, onAnalyze }: TranscriptEmptyProps) {
  return (
    <EmptyState title="Pas encore de transcription">
      <Button
        disabled={!canAnalyze}
        aria-describedby={canAnalyze ? undefined : NO_AUDIO_ID}
        onClick={onAnalyze}
      >
        <Sparkles size={16} aria-hidden="true" />
        Transcrire et créer le compte rendu
      </Button>
      {!canAnalyze && (
        <p id={NO_AUDIO_ID} className="caption">
          Aucun audio n’a été enregistré.
        </p>
      )}
    </EmptyState>
  );
}
