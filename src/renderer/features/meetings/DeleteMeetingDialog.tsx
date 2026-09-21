import { Button, Dialog } from '../../components/ui';

interface DeleteMeetingDialogProps {
  busy: boolean;
  onClose(): void;
  onDelete(): Promise<void>;
}

export function DeleteMeetingDialog({ busy, onClose, onDelete }: DeleteMeetingDialogProps) {
  async function remove() {
    await onDelete();
    onClose();
  }

  return (
    <Dialog title="Supprimer cette réunion ?" onClose={onClose}>
      <p>Les notes et les enregistrements locaux seront supprimés.</p>
      <div className="dialog-actions">
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          Annuler
        </Button>
        <Button variant="danger" busy={busy} onClick={() => void remove()}>
          Supprimer
        </Button>
      </div>
    </Dialog>
  );
}
