import type { Meeting } from '../backend/domain/meeting';
import type { Folder } from '../backend/domain/folder';
import type { RecordingRequest, RecordingState } from './recording-state';
import type { IslandRequest, IslandSnapshot } from './island';
import type { RecordingStartOutcome, RecordingStartRequest } from './recording-start';
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
export type Appearance = 'system' | 'light' | 'dark';

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
  appearance: Appearance;
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
  /** Set on the screen that holds the menu bar. */
  primary?: boolean;
}
/** What the system says about a capture right: only `denied` stops the user. */
export type CapturePermission = 'granted' | 'denied' | 'not-determined';
export type CapturePermissionKind = 'screen' | 'microphone';
/** The choices of the last recording, offered again at the next one. */
export interface CapturePrefs {
  microphone: boolean;
  systemAudio: boolean;
  screen: boolean;
  autoAnalyze: boolean;
  /** A screen only: a window gets a new identifier each time it opens. */
  screenId?: string;
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
  openMicrophoneSettings(): Promise<Result<void>>;
  getCapturePermission(kind: CapturePermissionKind): Promise<Result<CapturePermission>>;
  getCapturePrefs(): Promise<Result<CapturePrefs>>;
  setCapturePrefs(prefs: CapturePrefs): Promise<Result<void>>;
  getSources(): Promise<Result<CaptureSource[]>>;
  selectSource(id: string, systemAudio: boolean): Promise<Result<void>>;
  openDataFolder(): Promise<Result<void>>;
  checkLocalSetup(): Promise<Result<LocalSetupStatus>>;
  openSetupGuide(guide: SetupGuide): Promise<Result<void>>;
  isFullScreen(): Promise<Result<boolean>>;
  /** Returns the function that stops listening. */
  onFullScreenChange(listener: (fullScreen: boolean) => void): () => void;
  /** Tells the main process (menu bar, island) the time recorded, the pause and the closing. */
  announceRecordingState(state: RecordingState): Promise<Result<void>>;
  /** Menu bar « Nouvelle réunion… ». Returns the unsubscribe function. */
  onMenuBarNewRecording(listener: () => void): () => void;
  /** Audio level of the recording, 0 to 1, ten times a second; the island draws it. */
  sendLevel(level: number): void;
  /** Pause, resume or stop asked from the menu bar or the island. Returns the unsubscribe function. */
  onRecordingRequest(listener: (request: RecordingRequest) => void): () => void;
  /**
   * A start asked from the ready island, while the window may stay hidden: run the dialog's start
   * and answer with `answerStartRequest`. Subscribe before the first `announceRecordingState`.
   */
  onStartRequest(listener: (request: RecordingStartRequest) => void): () => void;
  answerStartRequest(id: string, outcome: RecordingStartOutcome): Promise<Result<void>>;
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
  /** Stores the colour scheme and applies it to the window at once. */
  setAppearance(value: Appearance): Promise<Result<void>>;
}
/** What the island page may do: it only talks to the main process. */
export interface IslandApi {
  /** Shows the island and returns what it must draw. */
  ready(): Promise<Result<IslandSnapshot>>;
  request(request: IslandRequest): Promise<Result<void>>;
  /** Each listener returns the function that stops listening. */
  onState(listener: (snapshot: IslandSnapshot) => void): () => void;
  onExpanded(listener: (expanded: boolean) => void): () => void;
  onLevel(listener: (level: number) => void): () => void;
  /** The end of a `start`: busy is over; on failure, the error to show. */
  onStartResult(listener: (outcome: RecordingStartOutcome) => void): () => void;
}
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
