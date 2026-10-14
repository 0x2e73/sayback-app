import { Circle } from 'lucide-react';
import type { DesktopApi, Settings } from '../../../shared/contracts';
import { analysisDestination } from '../../../shared/analysis-settings';
import { Button, Dialog, Notice } from '../../components/ui';
import { CaptureSources } from './CaptureSources';
import { useNewMeeting, type StartMeeting } from './use-new-meeting';

interface NewMeetingDialogProps {
  api: DesktopApi;
  onClose(): void;
  onStart: StartMeeting;
}

function analysisCostNote(settings: Settings): string {
  if (settings.transcriptionProvider === 'openai') {
    return ' OpenAI facture la transcription avec identification des voix, ainsi que les notes.';
  }
  if (settings.transcriptionProvider === 'local') {
    return ' La transcription locale ne génère pas de coût API.';
  }
  return ' Gemini peut facturer la transcription et les notes.';
}

export function NewMeetingDialog({ api, onClose, onStart }: NewMeetingDialogProps) {
  const form = useNewMeeting(api, onStart);

  return (
    <Dialog title="Nouvelle réunion" busy={form.busy} onClose={onClose}>
      <form onSubmit={(event) => void form.submit(event)} className="new-meeting-form">
        {form.error && (
          <div className="permission-notice">
            <Notice>{form.error}</Notice>
            {form.error.includes('Réglages Système') && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void form.openPrivacySettings()}
              >
                Ouvrir les réglages de confidentialité
              </Button>
            )}
          </div>
        )}
        <p className="muted">
          Un titre, vos sources, et vous pouvez vous concentrer sur la conversation.
        </p>
        <label className="field">
          Titre de la réunion
          <input
            autoFocus
            required
            maxLength={160}
            value={form.title}
            placeholder="Ex. Revue produit du vendredi"
            onChange={(event) => form.setTitle(event.target.value)}
          />
        </label>
        <CaptureSources
          selection={form.selection}
          sources={form.sources}
          sourceId={form.sourceId}
          onSelection={form.setSelection}
          onSource={form.setSourceId}
        />
        {form.hasAnalysis && form.settings ? (
          <label className="auto-analysis-option">
            <input
              type="checkbox"
              checked={form.autoAnalyze}
              onChange={(event) => form.setAutoAnalyze(event.target.checked)}
            />
            <span>
              <strong>Transcrire et créer le compte rendu après l’arrêt</strong>
              <small>
                {analysisDestination(form.settings)}
                {analysisCostNote(form.settings)}
              </small>
            </span>
          </label>
        ) : (
          <p className="caption">
            Configurez la transcription et le compte rendu dans les paramètres pour lancer l’analyse
            après la réunion. L’enregistrement reste local.
          </p>
        )}
        <p className="caption">
          Pendant la réunion, seuls les fichiers sont enregistrés sur cet ordinateur. Jusqu’à 2
          heures par session.
        </p>
        <Button type="submit" busy={form.busy} disabled={!form.canStart}>
          <Circle size={15} fill="currentColor" />
          Commencer l’enregistrement
        </Button>
      </form>
    </Dialog>
  );
}
