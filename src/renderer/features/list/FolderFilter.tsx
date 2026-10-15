import type { Folder, Meeting } from '../../../shared/contracts';
import { useHeld } from '../../components/use-held';
import { FolderChips } from './FolderChips';
import { FolderDeletionDialog } from './FolderDeletionDialog';
import { FolderMenu } from './FolderMenu';
import { FolderNameField } from './FolderNameField';
import type { FolderScope } from './list-filter';
import type { FolderActions } from './use-folders';
import { useFolderMenu } from './use-folder-menu';
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
  const menu = useFolderMenu();
  const selected =
    scope.kind === 'folder' ? folders.find((folder) => folder.id === scope.id) : undefined;
  // Both overlays keep their content while they play the exit.
  const menuOpen = menu.left !== null && selected !== undefined;
  const menuFolder = useHeld(menuOpen ? selected : null);
  const menuLeft = useHeld(menu.left);
  const deletionShown = useHeld(deletion.confirming);

  function choose(next: FolderScope): void {
    menu.close();
    onScope(next);
  }

  function rename(folder: Folder): void {
    menu.close();
    editor.startRename(folder);
  }

  function requestDeletion(folder: Folder): void {
    // The dialog hands the focus back to what held it: make that the chip, not the closing menu.
    menu.anchor.current?.focus();
    menu.close();
    deletion.request(folder);
  }

  return (
    <div className="folder-filter" ref={menu.wrapper}>
      <FolderChips
        folders={folders}
        scope={scope}
        locked={locked}
        menuOpen={menu.left !== null}
        menuAnchor={menu.anchor}
        dropProps={dropProps}
        onChoose={choose}
        onToggleMenu={menu.toggle}
        onCreate={editor.startCreate}
      />
      {menuFolder && menuLeft !== null && (
        <FolderMenu
          open={menuOpen}
          folder={menuFolder}
          anchor={menu.anchor}
          left={menuLeft}
          onRename={rename}
          onDelete={requestDeletion}
          onClose={menu.close}
        />
      )}
      {editor.editing && (
        <FolderNameField
          key={editor.editingId}
          name={editor.name}
          busy={editor.busy}
          error={editor.error}
          onName={editor.setName}
          onSave={() => void editor.submit()}
          onCancel={editor.cancel}
        />
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement && <span key={announcement.id}>{announcement.text}</span>}
      </p>
      {deletionShown && (
        <FolderDeletionDialog
          open={deletion.confirming !== null}
          folder={deletionShown}
          busy={deletion.deleting}
          onConfirm={deletion.confirm}
          onClose={deletion.cancel}
        />
      )}
    </div>
  );
}
