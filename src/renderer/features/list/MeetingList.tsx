import { useId, type KeyboardEvent } from 'react';
import type { Folder, Meeting } from '../../../shared/contracts';
import type { DateGroup } from './date-groups';
import { MeetingRow } from './MeetingRow';
import { targetForKey } from './selection';

interface MeetingListProps {
  groups: DateGroup<Meeting>[];
  folders: Folder[];
  selectedId: string | null;
  now: Date;
  locked: boolean;
  onSelect(id: string): void;
}

function hasModifier(event: KeyboardEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function focusedRowId(event: KeyboardEvent): string | null {
  if (!(event.target instanceof Element)) return null;
  return event.target.closest<HTMLElement>('[role="option"]')?.dataset.meetingId ?? null;
}

function focusOption(list: HTMLElement, id: string): void {
  for (const option of list.querySelectorAll<HTMLElement>('[role="option"]')) {
    if (option.dataset.meetingId === id) option.focus();
  }
}

export function MeetingList(props: MeetingListProps) {
  const { groups, folders, selectedId, now, locked, onSelect } = props;
  const baseId = useId();
  const ids = groups.flatMap((group) => group.items.map((meeting) => meeting.id));
  const tabStop = selectedId !== null && ids.includes(selectedId) ? selectedId : ids[0];

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (locked || hasModifier(event)) return;
    const next = targetForKey(event.key, ids, selectedId, focusedRowId(event));
    if (!next) return;
    event.preventDefault();
    if (next === selectedId) return;
    onSelect(next);
    focusOption(event.currentTarget, next);
  }

  return (
    <div role="listbox" aria-label="Réunions" className="meeting-list" onKeyDown={handleKeyDown}>
      {groups.map((group) => (
        <div
          key={group.key}
          role="group"
          aria-labelledby={`${baseId}-${group.key}`}
          className="date-group"
        >
          <div id={`${baseId}-${group.key}`} className="date-group-heading" aria-hidden="true">
            {group.label}
          </div>
          {group.items.map((meeting) => (
            <MeetingRow
              key={meeting.id}
              meeting={meeting}
              folder={folders.find((folder) => folder.id === meeting.folderId)}
              selected={meeting.id === selectedId}
              focusable={meeting.id === tabStop}
              locked={locked}
              now={now}
              onSelect={onSelect}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
