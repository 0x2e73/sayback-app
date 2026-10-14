import { useState, type DragEvent } from 'react';
import type { Folder, Meeting } from '../../../shared/contracts';
import { formatRowDate } from './date-groups';
import { RowStatus } from './RowStatus';
import { MEETING_DRAG_TYPE } from './useFolderDrop';

interface MeetingRowProps {
  meeting: Meeting;
  folder?: Folder;
  selected: boolean;
  focusable: boolean;
  locked: boolean;
  now: Date;
  onSelect(id: string): void;
}

export function MeetingRow(props: MeetingRowProps) {
  const { meeting, folder, selected, focusable, locked, now, onSelect } = props;
  const [dragging, setDragging] = useState(false);
  // A move while recording or analysing would be overwritten by the final save.
  const settled = meeting.status !== 'recording' && meeting.status !== 'processing';

  function select(): void {
    if (!locked) onSelect(meeting.id);
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
      className={`meeting-row${dragging ? ' is-dragging' : ''}`}
      draggable={!locked && settled}
      onClick={select}
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
      {folder && <span className="chip chip-static">{folder.name}</span>}
    </div>
  );
}
