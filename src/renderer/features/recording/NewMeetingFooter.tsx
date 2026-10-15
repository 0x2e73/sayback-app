import { Button } from '../../components/ui';

interface NewMeetingFooterProps {
  busy: boolean;
  canStart: boolean;
  /** The form the submit button belongs to: the footer sits outside it. */
  formId: string;
  onCancel(): void;
}

export function NewMeetingFooter({ busy, canStart, formId, onCancel }: NewMeetingFooterProps) {
  return (
    <>
      <Button variant="ghost" disabled={busy} onClick={onCancel}>
        Annuler
      </Button>
      <Button type="submit" form={formId} busy={busy} disabled={!canStart}>
        Démarrer l’enregistrement
      </Button>
    </>
  );
}
