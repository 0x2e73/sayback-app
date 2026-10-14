import type { Folder, Meeting } from '../../../shared/contracts';

export type FolderScope = { kind: 'all' } | { kind: 'unfiled' } | { kind: 'folder'; id: string };

export const ALL_MEETINGS: FolderScope = { kind: 'all' };
export const UNFILED: FolderScope = { kind: 'unfiled' };

type Filterable = Pick<Meeting, 'title' | 'notes' | 'folderId'>;

export interface EmptyList {
  message: string;
  searchEverywhere: boolean;
}

interface EmptyListInput {
  total: number;
  scope: FolderScope;
  query: string;
  folders: readonly Folder[];
}

/** Case, accent and ligature insensitive, with runs of whitespace collapsed. */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-CH')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/\s+/g, ' ')
    .trim();
}

function inScope(meeting: Filterable, scope: FolderScope): boolean {
  if (scope.kind === 'all') return true;
  if (scope.kind === 'unfiled') return !meeting.folderId;
  return meeting.folderId === scope.id;
}

function matches(meeting: Filterable, needle: string): boolean {
  if (!needle) return true;
  const summary = meeting.notes?.summary ?? '';
  return normalizeSearch(`${meeting.title} ${summary}`).includes(needle);
}

export function filterMeetings<T extends Filterable>(
  meetings: readonly T[],
  scope: FolderScope,
  query: string,
): T[] {
  const needle = normalizeSearch(query);
  return meetings.filter((meeting) => inScope(meeting, scope) && matches(meeting, needle));
}

/** A folder deleted or renamed away falls back to every meeting. */
export function resolveScope(scope: FolderScope, folders: readonly Folder[]): FolderScope {
  if (scope.kind !== 'folder') return scope;
  return folders.some((folder) => folder.id === scope.id) ? scope : ALL_MEETINGS;
}

export function emptyList({ total, scope, query, folders }: EmptyListInput): EmptyList {
  const typed = query.replace(/\s+/g, ' ').trim();
  if (total === 0) return { message: 'Aucune réunion', searchEverywhere: false };
  if (typed) {
    return { message: `Aucune réunion pour « ${typed} »`, searchEverywhere: scope.kind !== 'all' };
  }
  if (scope.kind === 'unfiled')
    return { message: 'Aucune réunion sans dossier', searchEverywhere: false };
  const folder = scope.kind === 'folder' ? folders.find((item) => item.id === scope.id) : undefined;
  if (!folder) return { message: 'Aucune réunion', searchEverywhere: false };
  return { message: `Aucune réunion dans « ${folder.name} »`, searchEverywhere: false };
}
