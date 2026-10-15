import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
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
  arrivedIds: ReadonlySet<string>;
  /** `keyboard` when an arrow key chose the row: the card then changes without an entrance. */
  onSelect(id: string, by?: 'keyboard'): void;
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

/**
 * The highlight is one element that glides to the selected row, placed by hand like the
 * segmented thumb. It glides only from one row to another: the first placement, a placement
 * after no row was selected, and a resize all jump.
 */
function useSelectionThumb(selectedId: string | null, groups: unknown) {
  const list = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const box = list.current;
    const mark = thumb.current;
    if (!box || !mark) return;
    function place(glide: boolean): void {
      const row = box?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]');
      if (!mark) return;
      if (!row) {
        mark.style.opacity = '0';
        delete mark.dataset.ready;
        return;
      }
      if (!glide) delete mark.dataset.ready;
      mark.style.height = `${row.offsetHeight}px`;
      mark.style.transform = `translateY(${row.offsetTop}px)`;
      if (!('ready' in mark.dataset)) {
        void mark.offsetHeight;
        mark.dataset.ready = '';
      }
      mark.style.opacity = '1';
    }
    place(true);
    if (typeof ResizeObserver === 'undefined') return;
    // The observer reports once on start: only a real change of width is a resize.
    let width = box.offsetWidth;
    const observer = new ResizeObserver(() => {
      if (box.offsetWidth === width) return;
      width = box.offsetWidth;
      place(false);
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [selectedId, groups]);
  return { list, thumb };
}

// Rows have stopped entering once the longest delay and duration have passed.
const ENTRANCE_MS = 600;

export function MeetingList(props: MeetingListProps) {
  const { groups, folders, selectedId, now, locked, arrivedIds, onSelect } = props;
  const baseId = useId();
  const { list, thumb } = useSelectionThumb(selectedId, groups);
  // The rows stagger in once, when the list appears; rows added later do not replay it.
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setEntering(false), ENTRANCE_MS);
    return () => clearTimeout(timer);
  }, []);
  const ids = groups.flatMap((group) => group.items.map((meeting) => meeting.id));
  const tabStop = selectedId !== null && ids.includes(selectedId) ? selectedId : ids[0];

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (locked || hasModifier(event)) return;
    const next = targetForKey(event.key, ids, selectedId, focusedRowId(event));
    if (!next) return;
    event.preventDefault();
    if (next === selectedId) return;
    onSelect(next, 'keyboard');
    focusOption(event.currentTarget, next);
  }

  return (
    <div
      ref={list}
      role="listbox"
      aria-label="Réunions"
      className="meeting-list"
      data-enter={entering || undefined}
      onKeyDown={handleKeyDown}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget) setEntering(false);
      }}
    >
      <span ref={thumb} className="meeting-list-selection" aria-hidden="true" />
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
              arrived={arrivedIds.has(meeting.id)}
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
