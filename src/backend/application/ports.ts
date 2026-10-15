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
/** Local speech to text for the live draft; never a remote provider. */
export interface LiveEngine {
  /** Text of 16 kHz mono samples. Rejects when the engine is not ready. */
  transcribe(samples: Int16Array, signal: AbortSignal): Promise<string>;
}
