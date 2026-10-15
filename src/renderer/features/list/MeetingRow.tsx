import { useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react';
import type { Folder, Meeting } from '../../../shared/contracts';
import { formatRowDate } from './date-groups';
import { platformOf } from '../../platform';
import { useChanged } from '../../components/use-changed';
import { RowStatus } from './RowStatus';
import { isSettled, placeUnder, type MenuPlace } from './row-menu';
import { MEETING_DRAG_TYPE } from './useFolderDrop';

interface MeetingRowProps {
  meeting: Meeting;
  folder?: Folder;
  selected: boolean;
  focusable: boolean;
  /** Added since the list loaded: it enters instead of being there. */
  arrived: boolean;
  locked: boolean;
  now: Date;
  onSelect(id: string, by?: 'keyboard'): void;
  onMenu(meeting: Meeting, at?: MenuPlace): void;
}

export function MeetingRow(props: MeetingRowProps) {
  const { meeting, folder, selected, focusable, arrived, locked, now, onSelect, onMenu } = props;
  const folderChanged = useChanged(meeting.folderId ?? null);
  const [dragging, setDragging] = useState(false);
  const settled = isSettled(meeting);

  // Ctrl+click is the secondary click of a Mac: the menu opens, the row is not chosen.
  function select(event: MouseEvent): void {
    if (platformOf(navigator.platform) === 'mac' && event.ctrlKey) return;
    if (!locked) onSelect(meeting.id);
  }

  function openMenu(event: MouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    if (!locked) onMenu(meeting);
  }

  function menuKey(event: KeyboardEvent<HTMLDivElement>): void {
    const asked = event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
    if (!asked || event.target !== event.currentTarget) return;
    event.preventDefault();
    if (!locked) onMenu(meeting, placeUnder(event.currentTarget));
  }

  function startDrag(event: DragEvent<HTMLDivElement>): void {
    event.dataTransfer.setData(MEETING_DRAG_TYPE, meeting.id);
    event.dataTransfer.effectAllowed = 'move';
    setDragging(true);
  }

  return (
    <div
      role="option"
      aria-selected={selected}
      aria-disabled={locked || undefined}
      tabIndex={focusable ? 0 : -1}
      data-meeting-id={meeting.id}
      data-new={arrived || undefined}
      className={`meeting-row${dragging ? ' is-dragging' : ''}`}
      draggable={!locked && settled}
      onClick={select}
      onContextMenu={openMenu}
      onKeyDown={menuKey}
      onDragStart={startDrag}
      onDragEnd={() => setDragging(false)}
    >
      <span className="meeting-row-heading">
        <span className="meeting-row-title">{meeting.title}</span>
        <time className="meeting-row-date" dateTime={meeting.createdAt}>
          {formatRowDate(meeting.createdAt, now)}
        </time>
      </span>
      <RowStatus meeting={meeting} />
      {folder && (
        <span className="chip chip-static" data-changed={folderChanged || undefined}>
          {folder.name}
        </span>
      )}
    </div>
  );
}
