import { useRef, useState } from 'react';
import type { Folder, Meeting } from '../../../shared/contracts';
import { FolderChips } from './FolderChips';
import { FolderDeletionDialog } from './FolderDeletionDialog';
import { FolderMenu } from './FolderMenu';
import { FolderNameField } from './FolderNameField';
import type { FolderScope } from './list-filter';
import type { FolderActions } from './use-folders';
import { useFolderDeletion } from './useFolderDeletion';
import { useFolderDrop } from './useFolderDrop';
import { useFolderEditor } from './useFolderEditor';

interface FolderFilterProps {
  folders: Folder[];
  meetings: Meeting[];
  scope: FolderScope;
  locked: boolean;
  actions: FolderActions;
  onScope(scope: FolderScope): void;
}

export function FolderFilter(props: FolderFilterProps) {
  const { folders, meetings, scope, locked, actions, onScope } = props;
  const editor = useFolderEditor({ onCreate: actions.create, onRename: actions.rename });
  const deletion = useFolderDeletion(actions.remove);
  const { dropProps, announcement } = useFolderDrop({ meetings, folders, onMove: actions.move });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const selected =
    scope.kind === 'folder' ? folders.find((folder) => folder.id === scope.id) : undefined;

  function choose(next: FolderScope): void {
    setMenuOpen(false);
    onScope(next);
  }

  function closeMenu(restoreFocus: boolean): void {
    setMenuOpen(false);
    if (restoreFocus) menuAnchor.current?.focus();
  }

  function rename(folder: Folder): void {
    setMenuOpen(false);
    editor.startRename(folder);
  }

  function requestDeletion(folder: Folder): void {
    setMenuOpen(false);
    deletion.request(folder);
  }

  return (
    <div className="folder-filter">
      <FolderChips
        folders={folders}
        scope={scope}
        locked={locked}
        menuOpen={menuOpen}
        menuAnchor={menuAnchor}
        dropProps={dropProps}
        onChoose={choose}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onCreate={editor.startCreate}
      />
      {menuOpen && selected && (
        <FolderMenu
          folder={selected}
          anchor={menuAnchor}
          onRename={rename}
          onDelete={requestDeletion}
          onClose={closeMenu}
        />
      )}
      {editor.editing && (
        <FolderNameField
          name={editor.name}
          busy={editor.busy}
          onName={editor.setName}
          onSave={() => void editor.submit()}
          onCancel={editor.cancel}
        />
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement && <span key={announcement.id}>{announcement.text}</span>}
      </p>
      {deletion.confirming && (
        <FolderDeletionDialog
          folder={deletion.confirming}
          busy={deletion.deleting}
          onConfirm={deletion.confirm}
          onClose={deletion.cancel}
        />
      )}
    </div>
  );
}
