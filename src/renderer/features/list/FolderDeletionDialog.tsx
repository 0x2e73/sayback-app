import type { Folder } from '../../../shared/contracts';
import { ConfirmDialog } from '../../components/ui';

interface FolderDeletionDialogProps {
  folder: Folder;
  open: boolean;
  busy: boolean;
  onConfirm(folder: Folder): Promise<boolean>;
  onClose(): void;
}

export function FolderDeletionDialog(props: FolderDeletionDialogProps) {
  return (
    <ConfirmDialog
      open={props.open}
      title={`Supprimer « ${props.folder.name} » ?`}
      confirmLabel="Supprimer le dossier"
      busy={props.busy}
      onConfirm={() => props.onConfirm(props.folder)}
      onClose={props.onClose}
    >
      Les réunions qu’il contient restent disponibles, sans dossier.
    </ConfirmDialog>
  );
}
