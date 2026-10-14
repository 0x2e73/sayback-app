import { ChevronDown } from 'lucide-react';
import type { Folder, Meeting } from '../../../shared/contracts';
import { FolderNameField } from '../list/FolderNameField';
import { useFolderEditor } from '../list/useFolderEditor';

// Folder ids are UUIDs; « Sans dossier » is the empty value.
const NEW_FOLDER = 'new-folder';

interface FolderControlProps {
  meeting: Meeting;
  folders: Folder[];
  onMove(folderId: string | null): void;
  onCreate(name: string): Promise<Folder | null>;
}

// The header only creates folders; renaming lives in the list's chip menu.
async function noRename(): Promise<boolean> {
  return false;
}

/** A chip face over a transparent native select: the menu and the keyboard stay native. */
export function FolderControl({ meeting, folders, onMove, onCreate }: FolderControlProps) {
  async function createAndMove(name: string): Promise<Folder | null> {
    const folder = await onCreate(name);
    if (folder) onMove(folder.id);
    return folder;
  }
  const editor = useFolderEditor({ onCreate: createAndMove, onRename: noRename });
  const current = folders.find((folder) => folder.id === meeting.folderId);
  const settled = meeting.status !== 'recording' && meeting.status !== 'processing';

  function choose(value: string): void {
    if (value === NEW_FOLDER) editor.startCreate();
    else onMove(value || null);
  }

  if (editor.editing) {
    return (
      <FolderNameField
        name={editor.name}
        busy={editor.busy}
        error={editor.error}
        onName={editor.setName}
        onSave={() => void editor.submit()}
        onCancel={editor.cancel}
      />
    );
  }
  return (
    <span className="folder-control">
      <span className="chip folder-control-face" aria-hidden="true">
        {current?.name ?? 'Ajouter à un dossier…'}
        <ChevronDown size={12} />
      </span>
      <select
        className="folder-control-select"
        aria-label="Dossier de la réunion"
        value={current?.id ?? ''}
        disabled={!settled}
        onChange={(event) => choose(event.target.value)}
      >
        <option value="">Sans dossier</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
        <option value={NEW_FOLDER}>Nouveau dossier…</option>
      </select>
    </span>
  );
}
