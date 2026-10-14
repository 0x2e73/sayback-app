import type { RefObject, WheelEvent } from 'react';
import type { Folder } from '../../../shared/contracts';
import { Chip } from '../../components/ui';
import { ALL_MEETINGS, UNFILED, type FolderScope } from './list-filter';
import type { useFolderDrop } from './useFolderDrop';

type DropProps = ReturnType<typeof useFolderDrop>['dropProps'];

interface FolderChipProps {
  folder: Folder;
  selected: boolean;
  locked: boolean;
  menuOpen: boolean;
  menuAnchor: RefObject<HTMLButtonElement | null>;
  dropProps: DropProps;
  onChoose(scope: FolderScope): void;
  onToggleMenu(): void;
}

function FolderChip(props: FolderChipProps) {
  const { folder, selected, locked, menuOpen, menuAnchor, dropProps } = props;

  function click(): void {
    if (selected) props.onToggleMenu();
    else props.onChoose({ kind: 'folder', id: folder.id });
  }

  return (
    <Chip
      ref={selected ? menuAnchor : undefined}
      pressed={selected}
      disabled={locked}
      aria-haspopup={selected ? 'menu' : undefined}
      aria-expanded={selected ? menuOpen : undefined}
      {...dropProps(folder.id)}
      onClick={click}
    >
      {folder.name}
    </Chip>
  );
}

interface FolderChipsProps {
  folders: Folder[];
  scope: FolderScope;
  locked: boolean;
  menuOpen: boolean;
  menuAnchor: RefObject<HTMLButtonElement | null>;
  dropProps: DropProps;
  onChoose(scope: FolderScope): void;
  onToggleMenu(): void;
  onCreate(): void;
}

// A mouse wheel only turns vertically: let it drive the row when the chips overflow.
function scrollSideways(event: WheelEvent<HTMLDivElement>): void {
  const row = event.currentTarget;
  if (row.scrollWidth <= row.clientWidth) return;
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  row.scrollLeft += event.deltaY;
}

export function FolderChips(props: FolderChipsProps) {
  const { folders, scope, locked, dropProps, onChoose } = props;
  return (
    <div className="folder-bar">
      <div className="folder-chips" role="group" aria-label="Dossiers" onWheel={scrollSideways}>
        <Chip
          pressed={scope.kind === 'all'}
          disabled={locked}
          onClick={() => onChoose(ALL_MEETINGS)}
        >
          Tous
        </Chip>
        {folders.map((folder) => (
          <FolderChip
            key={folder.id}
            folder={folder}
            selected={scope.kind === 'folder' && scope.id === folder.id}
            locked={locked}
            menuOpen={props.menuOpen}
            menuAnchor={props.menuAnchor}
            dropProps={dropProps}
            onChoose={onChoose}
            onToggleMenu={props.onToggleMenu}
          />
        ))}
        <Chip
          pressed={scope.kind === 'unfiled'}
          disabled={locked}
          {...dropProps(null)}
          onClick={() => onChoose(UNFILED)}
        >
          Sans dossier
        </Chip>
      </div>
      <Chip aria-label="Nouveau dossier" disabled={locked} onClick={props.onCreate}>
        +
      </Chip>
    </div>
  );
}
