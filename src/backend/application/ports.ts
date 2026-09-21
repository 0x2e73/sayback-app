import type { AudioChunk, Meeting, Notes, Segment } from '../domain/meeting';
import type { Folder } from '../domain/folder';

export interface MeetingRepository {
  list(): Meeting[];
  get(id: string): Meeting | undefined;
  save(meeting: Meeting): void;
  delete(id: string): void;
}
export interface FolderRepository {
  listFolders(): Folder[];
  getFolder(id: string): Folder | undefined;
  saveFolder(folder: Folder): void;
  deleteFolder(id: string): void;
}
export interface Intelligence {
  readonly transcriptionConcurrency?: number;
  transcribe(meetingId: string, chunk: AudioChunk): Promise<Segment[]>;
  summarize(meeting: Meeting): Promise<Notes>;
}
