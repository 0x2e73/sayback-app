import { useState } from 'react';
import type { Meeting, MeetingExportKind } from '../../../shared/contracts';
import { Button, Dialog, Notice } from '../../components/ui';
import type { useMeetingExport } from './use-meeting-export';

interface ExportMeetingDialogProps {
  meeting: Meeting;
  actions: ReturnType<typeof useMeetingExport>;
}

export function ExportMeetingDialog({ meeting, actions }: ExportMeetingDialogProps) {
  const [kind, setKind] = useState<MeetingExportKind>('complete');
  const options = [
    {
      value: 'complete',
      label: 'Compte rendu complet',
      detail: 'Notes IA, précisions et transcription intégrale.',
      available:
        meeting.transcript.length > 0 ||
        meeting.notes !== null ||
        meeting.clarifications.length > 0,
    },
    {
      value: 'transcript',
      label: 'Transcription seule',
      detail: 'Tous les passages avec leurs horodatages.',
      available: meeting.transcript.length > 0,
    },
    {
      value: 'notes',
      label: 'Notes seules',
      detail: 'Résumé, décisions, actions et précisions.',
      available: meeting.notes !== null || meeting.clarifications.length > 0,
    },
  ] as const;
  return (
    <Dialog
      title="Exporter la réunion"
      open={actions.open}
      busy={actions.busy}
      onClose={actions.close}
      footer={
        <>
          <Button variant="secondary" onClick={actions.close} disabled={actions.busy}>
            Annuler
          </Button>
          <Button
            busy={actions.busy}
            disabled={!options.find((option) => option.value === kind)?.available}
            onClick={() => void actions.save(kind)}
          >
            Enregistrer sous…
          </Button>
        </>
      }
    >
      {actions.error && <Notice>{actions.error}</Notice>}
      <p>Un fichier Markdown (.md) à partager, sans les enregistrements audio ou vidéo.</p>
      <fieldset className="export-options" disabled={actions.busy}>
        <legend>Contenu du fichier</legend>
        {options.map((option) => (
          <label key={option.value} className="export-option">
            <input
              type="radio"
              name="meeting-export"
              value={option.value}
              checked={kind === option.value}
              disabled={!option.available}
              onChange={() => setKind(option.value)}
            />
            <span>
              <strong>{option.label}</strong>
              <span className="notice-detail">{option.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}
