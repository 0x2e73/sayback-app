import type { Meeting } from '../backend/domain/meeting';
import type { Folder } from '../backend/domain/folder';
import type { RecordingAnnouncement } from './menu-bar';
import type { UpdateInstallOutcome, UpdateStatus } from '../backend/domain/update';
export type { Folder } from '../backend/domain/folder';
export type { UpdateInfo, UpdateInstallOutcome, UpdateStatus } from '../backend/domain/update';
export type {
  Segment,
  NoteItem,
  Notes,
  Clarification,
  AudioChunk,
  Frame,
  MeetingStatus,
  Meeting,
} from '../backend/domain/meeting';

export type NotesProvider = 'openai' | 'anthropic' | 'gemini' | 'compatible' | 'ollama';
export type TranscriptionProvider = 'openai' | 'gemini' | 'local';
export type KeyProvider = 'openai' | 'anthropic' | 'gemini' | 'compatible';

export interface Settings {
  notesProvider: NotesProvider;
  transcriptionProvider: TranscriptionProvider;
  hasOpenAiKey: boolean;
  hasAnthropicKey: boolean;
  hasGeminiKey: boolean;
  hasCompatibleKey: boolean;
  compatibleBaseUrl: string;
  whisperModelPath: string;
  model: string;
  onboardingCompleted: boolean;
}
export interface SettingsInput {
  notesProvider: NotesProvider;
  transcriptionProvider: TranscriptionProvider;
  model: string;
  openAiKey: string;
  anthropicKey: string;
  geminiKey: string;
  compatibleKey: string;
  compatibleBaseUrl: string;
  whisperModelPath: string;
}
export interface LocalSetupStatus {
  whisperCli: boolean;
  ffmpeg: boolean;
  whisperModel: boolean;
  ollama: boolean;
  notesModel: boolean;
  notesModelName: string;
}
export type SetupGuide = 'whisper' | 'ollama';
export interface CaptureSource {
  id: string;
  name: string;
  thumbnail: string;
}
export type MediaKind = 'video' | 'audio' | 'frame';
export interface MediaUpload {
  meetingId: string;
  kind: MediaKind;
  index: number;
  at: number;
  duration: number;
  bytes: ArrayBuffer;
}
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export interface DesktopApi {
  listMeetings(): Promise<Result<Meeting[]>>;
  listFolders(): Promise<Result<Folder[]>>;
  createFolder(name: string): Promise<Result<Folder>>;
  renameFolder(id: string, name: string): Promise<Result<Folder>>;
  deleteFolder(id: string): Promise<Result<void>>;
  moveMeeting(id: string, folderId: string | null): Promise<Result<Meeting>>;
  createMeeting(title: string): Promise<Result<Meeting>>;
  getMeeting(id: string): Promise<Result<Meeting>>;
  finishMeeting(id: string, duration: number): Promise<Result<Meeting>>;
  processMeeting(id: string): Promise<Result<Meeting>>;
  clarify(id: string, at: number, text: string): Promise<Result<Meeting>>;
  deleteMeeting(id: string): Promise<Result<void>>;
  saveMedia(upload: MediaUpload): Promise<Result<void>>;
  getSettings(): Promise<Result<Settings>>;
  completeOnboarding(): Promise<Result<void>>;
  listModels(provider: NotesProvider): Promise<Result<string[]>>;
  saveSettings(input: SettingsInput): Promise<Result<Settings>>;
  clearApiKey(provider: KeyProvider): Promise<Result<Settings>>;
  openScreenRecordingSettings(): Promise<Result<void>>;
  getSources(): Promise<Result<CaptureSource[]>>;
  selectSource(id: string, systemAudio: boolean): Promise<Result<void>>;
  openDataFolder(): Promise<Result<void>>;
  checkLocalSetup(): Promise<Result<LocalSetupStatus>>;
  openSetupGuide(guide: SetupGuide): Promise<Result<void>>;
  isFullScreen(): Promise<Result<boolean>>;
  /** Returns the function that stops listening. */
  onFullScreenChange(listener: (fullScreen: boolean) => void): () => void;
  /** Tells the menu bar whether a recording runs, and since when (ISO date). */
  announceRecording(state: RecordingAnnouncement): Promise<Result<void>>;
  /** Menu bar « Nouvel enregistrement… ». Returns the unsubscribe function. */
  onMenuBarNewRecording(listener: () => void): () => void;
  /** Menu bar « Arrêter l’enregistrement ». Returns the unsubscribe function. */
  onMenuBarStopRecording(listener: () => void): () => void;
  /** Last known update state; the first call waits for the startup read of the channel. */
  getUpdateStatus(): Promise<Result<UpdateStatus>>;
  /** Re-reads the update channel now. */
  checkForUpdate(): Promise<Result<UpdateStatus>>;
  /**
   * Asks the user natively (« Installer et redémarrer » / « Plus tard »), then replaces the app
   * with the staged version and relaunches it: `started` means the app quits right after the
   * answer, `postponed` that nothing was done. Refused, with a sentence to display, during a
   * recording or when nothing can install.
   */
  installUpdate(): Promise<Result<UpdateInstallOutcome>>;
  /** Called on every change of update state. Returns the unsubscribe function. */
  onUpdateStatus(listener: (status: UpdateStatus) => void): () => void;
}
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
