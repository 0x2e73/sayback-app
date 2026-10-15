import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { Folder, Meeting } from '../../../shared/contracts';

export const MEETING_DRAG_TYPE = 'application/x-sayback-meeting';

interface FolderDropOptions {
  meetings: Meeting[];
  folders: Folder[];
  onMove(meetingId: string, folderId: string | null): Promise<boolean>;
}

interface Announcement {
  id: number;
  text: string;
}

function dropAnnouncement(folderId: string | null, folders: Folder[]): string {
  if (folderId === null) return 'Réunion retirée de son dossier.';
  const folder = folders.find((item) => item.id === folderId);
  return folder ? `Réunion déplacée dans « ${folder.name} ».` : 'Réunion déplacée.';
}

function startsMeetingDrag(event: Event): boolean {
  return event.target instanceof Element && event.target.closest('[data-meeting-id]') !== null;
}

export function useFolderDrop({ meetings, folders, onMove }: FolderDropOptions) {
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  // The chip that took a meeting flashes once; the animation clears the mark when it ends.
  const [accepted, setAccepted] = useState<string | null>(null);
  // From the moment a row is picked up until it lands or is let go: every chip that can take it shows it.
  const [dragging, setDragging] = useState(false);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  // The folder may be deleted while the move is pending, so read the latest list afterwards.
  const latestFolders = useRef(folders);
  useEffect(() => {
    latestFolders.current = folders;
  }, [folders]);

  useEffect(() => {
    const pickUp = (event: Event) => setDragging(startsMeetingDrag(event));
    const letGo = () => setDragging(false);
    document.addEventListener('dragstart', pickUp);
    document.addEventListener('dragend', letGo);
    document.addEventListener('drop', letGo);
    return () => {
      document.removeEventListener('dragstart', pickUp);
      document.removeEventListener('dragend', letGo);
      document.removeEventListener('drop', letGo);
    };
  }, []);

  async function drop(event: DragEvent<HTMLElement>, id: string | null): Promise<void> {
    event.preventDefault();
    setDragTarget(null);
    const meetingId = event.dataTransfer.getData(MEETING_DRAG_TYPE);
    const meeting = meetings.find((item) => item.id === meetingId);
    if (!meetingId || (meeting && (meeting.folderId ?? null) === id)) return;
    if (!(await onMove(meetingId, id))) return;
    setAccepted(id ?? 'all');
    const text = dropAnnouncement(id, latestFolders.current);
    setAnnouncement((previous) => ({ id: (previous?.id ?? 0) + 1, text }));
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
      'data-drop-ready': dragging || undefined,
      'data-accepted': accepted === key || undefined,
      onAnimationEnd: () => setAccepted(null),
    };
  }

  return { dropProps, announcement };
}
