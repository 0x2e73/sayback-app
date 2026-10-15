import { useEffect, useRef, type FocusEvent, type KeyboardEvent, type RefObject } from 'react';
import { Presence } from '../../components/Presence';
import type { PresenceBinding } from '../../components/use-presence';
import type { Folder } from '../../../shared/contracts';

interface FolderMenuProps {
  open: boolean;
  folder: Folder;
  anchor: RefObject<HTMLButtonElement | null>;
  left: number;
  onRename(folder: Folder): void;
  onDelete(folder: Folder): void;
  onClose(restoreFocus: boolean): void;
}

function moveFocus(menu: HTMLElement, step: 1 | -1): void {
  const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  const index = items.findIndex((item) => item === document.activeElement);
  items[(index + step + items.length) % items.length]?.focus();
}

export function FolderMenu({ open, ...props }: FolderMenuProps) {
  return (
    <Presence open={open}>
      {(presence) => <FolderMenuList {...props} presence={presence} />}
    </Presence>
  );
}

type ListProps = Omit<FolderMenuProps, 'open'> & { presence: PresenceBinding };

function FolderMenuList({
  folder,
  anchor,
  left,
  presence,
  onRename,
  onDelete,
  onClose,
}: ListProps) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose(true);
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    moveFocus(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1);
  }

  // Focus leaving for the chip is left to the chip's click, which toggles the menu shut.
  function handleBlur(event: FocusEvent<HTMLDivElement>): void {
    const next = event.relatedTarget;
    if (next === anchor.current) return;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    onClose(false);
  }

  return (
    <div
      ref={presence.ref}
      data-state={presence.state}
      className="folder-menu"
      role="menu"
      aria-label={folder.name}
      style={{ left }}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      <button ref={first} type="button" role="menuitem" onClick={() => onRename(folder)}>
        Renommer
      </button>
      <button type="button" role="menuitem" onClick={() => onDelete(folder)}>
        Supprimer…
      </button>
    </div>
  );
}
