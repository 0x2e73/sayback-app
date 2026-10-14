import { useState, type DragEvent } from 'react';
import { Folder as FolderIcon, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import type { Folder, Meeting } from '../../../shared/contracts';
import { ConfirmDialog } from '../../components/ui';
import { useFolderDeletion } from './useFolderDeletion';
import { useFolderEditor } from './useFolderEditor';

interface FolderBoardProps {
  folders: Folder[];
  meetings: Meeting[];
  selectedId: string | null;
  onSelect(id: string | null): void;
  onCreate(name: string): Promise<Folder | null>;
  onRename(id: string, name: string): Promise<boolean>;
  onDelete(id: string): Promise<boolean>;
  onMove(meetingId: string, folderId: string | null): Promise<boolean>;
}

export const MEETING_DRAG_TYPE = 'application/x-sayback-meeting';

function FolderHeader({ onCreate }: { onCreate(): void }) {
  return (
    <div className="folder-section-heading">
      <strong>Dossiers</strong>
      <button type="button" className="folder-create" onClick={onCreate}>
        <FolderPlus size={16} /> Nouveau dossier
      </button>
    </div>
  );
}

function FolderForm({
  name,
  onName,
  onSave,
  onCancel,
  busy,
}: {
  name: string;
  onName(name: string): void;
  onSave(): void;
  onCancel(): void;
  busy: boolean;
}) {
  return (
    <form
      className="folder-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <input
        autoFocus
        aria-label="Nom du dossier"
        className="field-control"
        maxLength={80}
        value={name}
        onChange={(event) => onName(event.target.value)}
        placeholder="Nom du dossier"
      />
      <button type="submit" className="button button-primary" disabled={!name.trim() || busy}>
        Enregistrer
      </button>
      <button type="button" className="button" disabled={busy} onClick={onCancel}>
        Annuler
      </button>
    </form>
  );
}

interface FolderEntryProps {
  folder: Folder;
  count: number;
  selected: boolean;
  dropHandlers: ReturnType<typeof useFolderDrop>['dropProps'];
  onSelect(id: string): void;
  onEdit(folder: Folder): void;
  onRequestDelete(folder: Folder): void;
}

function FolderEntry({
  folder,
  count,
  selected,
  dropHandlers,
  onSelect,
  onEdit,
  onRequestDelete,
}: FolderEntryProps) {
  return (
    <div className="folder-entry" {...dropHandlers(folder.id)}>
      <button
        type="button"
        className="folder-item"
        aria-pressed={selected}
        onClick={() => onSelect(folder.id)}
      >
        <FolderIcon size={19} />
        <span>{folder.name}</span>
        <small>{count}</small>
      </button>
      <button
        type="button"
        className="folder-action"
        aria-label={`Renommer ${folder.name}`}
        onClick={() => onEdit(folder)}
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        className="folder-action"
        aria-label={`Supprimer ${folder.name}`}
        onClick={() => onRequestDelete(folder)}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function useFolderDrop(onMove: FolderBoardProps['onMove'], folders: Folder[]) {
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  async function drop(event: DragEvent<HTMLElement>, id: string | null): Promise<void> {
    event.preventDefault();
    setDragTarget(null);
    const meetingId = event.dataTransfer.getData(MEETING_DRAG_TYPE);
    if (meetingId && (await onMove(meetingId, id))) {
      const folder = folders.find((item) => item.id === id);
      setAnnouncement(
        folder ? `Réunion déplacée dans « ${folder.name} ».` : 'Réunion retirée de son dossier.',
      );
    }
  }
  function dropProps(id: string | null) {
    const key = id ?? 'all';
    return {
      onDragEnter: (event: DragEvent<HTMLElement>) => {
        if (event.dataTransfer.types.includes(MEETING_DRAG_TYPE)) setDragTarget(key);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (event.dataTransfer.types.includes(MEETING_DRAG_TYPE)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          setDragTarget(key);
        }
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragTarget(null);
      },
      onDrop: (event: DragEvent<HTMLElement>) => void drop(event, id),
      'data-drag-over': dragTarget === key,
    };
  }
  return { dropProps, announcement };
}

interface FolderDeletionDialogProps {
  folder: Folder;
  busy: boolean;
  onConfirm(folder: Folder): Promise<void>;
  onClose(): void;
}

function FolderDeletionDialog(props: FolderDeletionDialogProps) {
  return (
    <ConfirmDialog
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

export function FolderBoard(props: FolderBoardProps) {
  const editor = useFolderEditor(props);
  const deletion = useFolderDeletion(props.onDelete);
  const { dropProps, announcement } = useFolderDrop(props.onMove, props.folders);

  return (
    <section className="folder-section" aria-label="Dossiers de réunions">
      <FolderHeader onCreate={editor.startCreate} />
      {editor.editing && (
        <FolderForm
          name={editor.name}
          busy={editor.busy}
          onName={editor.setName}
          onSave={() => void editor.submit()}
          onCancel={editor.cancel}
        />
      )}
      <div className="folder-list">
        <button
          type="button"
          className="folder-item"
          aria-pressed={props.selectedId === null}
          onClick={() => props.onSelect(null)}
        >
          <FolderIcon size={19} />
          <span>Toutes les réunions</span>
          <small>{props.meetings.length}</small>
        </button>
        <div className="folder-entry folder-unfiled" {...dropProps(null)}>
          <span className="folder-item">
            <FolderIcon size={19} />
            <span>Sans dossier</span>
            <small>{props.meetings.filter((meeting) => !meeting.folderId).length}</small>
          </span>
        </div>
        {props.folders.map((folder) => (
          <FolderEntry
            key={folder.id}
            folder={folder}
            count={props.meetings.filter((meeting) => meeting.folderId === folder.id).length}
            selected={props.selectedId === folder.id}
            dropHandlers={dropProps}
            onSelect={props.onSelect}
            onEdit={editor.startRename}
            onRequestDelete={deletion.request}
          />
        ))}
      </div>
      <p className="folder-hint">Glissez une réunion sur un dossier pour la ranger.</p>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      {deletion.confirming && (
        <FolderDeletionDialog
          folder={deletion.confirming}
          busy={deletion.deleting}
          onConfirm={deletion.confirm}
          onClose={deletion.cancel}
        />
      )}
    </section>
  );
}
