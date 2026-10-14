import { Sparkles } from 'lucide-react';
import { Button, EmptyState } from '../../components/ui';

interface AnalysisPromptProps {
  canAnalyze: boolean;
  onAnalyze(): void;
  onSettings(): void;
}

const NO_AUDIO_ID = 'analysis-no-audio';

export function AnalysisPrompt({ canAnalyze, onAnalyze, onSettings }: AnalysisPromptProps) {
  return (
    <EmptyState title="Prêt pour l’analyse.">
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
      <button type="button" className="text-link" onClick={onSettings}>
        Configurer l’analyse
      </button>
      <p className="caption">
        Les données envoyées et le coût éventuel dépendent des fournisseurs choisis dans les
        paramètres.
      </p>
    </EmptyState>
  );
}
