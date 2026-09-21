export interface Segment {
  id: string;
  start: number;
  end: number;
  text: string;
  speaker?: string;
}
export interface NoteItem {
  text: string;
  sourceIds: string[];
}
export interface Notes {
  summary: string;
  keyPoints: NoteItem[];
  decisions: NoteItem[];
  actions: NoteItem[];
  questions: NoteItem[];
}
export interface Clarification {
  id: string;
  at: number;
  text: string;
  createdAt: string;
}
export interface AudioChunk {
  index: number;
  start: number;
  duration: number;
  transcript: Segment[] | null;
}
export interface Frame {
  index: number;
  at: number;
}
export type MeetingStatus = 'recording' | 'recorded' | 'processing' | 'ready' | 'error';
export interface Meeting {
  id: string;
  folderId?: string | null;
  title: string;
  createdAt: string;
  status: MeetingStatus;
  processingStartedAt?: string;
  duration: number;
  hasVideo: boolean;
  audioChunks: AudioChunk[];
  frames: Frame[];
  transcript: Segment[];
  notes: Notes | null;
  clarifications: Clarification[];
  error: string | null;
}
