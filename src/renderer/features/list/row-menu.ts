import type { Folder, Meeting, MeetingMenuRequest } from '../../../shared/contracts';

/** Where a menu opens, in window coordinates. */
export interface MenuPlace {
  x: number;
  y: number;
}

/** A move or a deletion while recording or analysing would be overwritten or refused. */
export function isSettled(meeting: Meeting): boolean {
  return meeting.status !== 'recording' && meeting.status !== 'processing';
}

export function menuRequest(
  meeting: Meeting,
  folders: Folder[],
  at?: MenuPlace,
): MeetingMenuRequest {
  return {
    meetingId: meeting.id,
    folders: folders.map(({ id, name }) => ({ id, name })),
    folderId: meeting.folderId ?? null,
    disabled: !isSettled(meeting),
    ...(at && { at }),
  };
}

/** The keyboard has no pointer: the menu hangs from the foot of the row. */
export function placeUnder(row: Element): MenuPlace {
  const box = row.getBoundingClientRect();
  return { x: Math.max(0, Math.round(box.left + 24)), y: Math.max(0, Math.round(box.bottom)) };
}
