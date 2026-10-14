import { ConfirmDialog } from '../../components/ui';

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
    <ConfirmDialog
      title="Supprimer cette réunion ?"
      confirmLabel="Supprimer"
      busy={busy}
      onConfirm={remove}
      onClose={onClose}
    >
      Les notes et les enregistrements locaux seront supprimés. Cette action est définitive.
    </ConfirmDialog>
  );
}
