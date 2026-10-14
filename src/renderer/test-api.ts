import type {
  DesktopApi,
  LocalSetupStatus,
  Meeting,
  Result,
  Settings,
  UpdateStatus,
} from '../shared/contracts';

export const settings: Settings = {
  notesProvider: 'openai',
  transcriptionProvider: 'openai',
  hasOpenAiKey: false,
  hasAnthropicKey: false,
  hasGeminiKey: false,
  hasCompatibleKey: false,
  compatibleBaseUrl: '',
  whisperModelPath: '',
  model: 'gpt-4.1-mini',
  onboardingCompleted: true,
};

export const readySetup: LocalSetupStatus = {
  whisperCli: true,
  ffmpeg: true,
  whisperModel: true,
  ollama: true,
  notesModel: true,
  notesModelName: 'gemma3:4b',
};

export const upToDate: UpdateStatus = {
  current: { version: '0.1.0', commit: 'a'.repeat(40), builtAt: '2026-10-13T10:00:00.000Z' },
  available: null,
  canInstall: true,
};

export const ok = <T>(value: T): Promise<Result<T>> => Promise.resolve({ ok: true, value });

export function apiFor(meetings: Meeting[] = []): DesktopApi {
  return {
    listMeetings: () => ok(meetings),
    listFolders: () => ok([]),
    createFolder: async () => {
      throw new Error('Not used');
    },
    renameFolder: async () => {
      throw new Error('Not used');
    },
    deleteFolder: async () => {
      throw new Error('Not used');
    },
    moveMeeting: async () => {
      throw new Error('Not used');
    },
    getSettings: () => ok(settings),
    completeOnboarding: () => ok(undefined),
    listModels: () => ok(['gpt-4.1-mini', 'gpt-4o', 'whisper-1']),
    saveSettings: () => ok({ ...settings, hasOpenAiKey: true }),
    clearApiKey: () => ok(settings),
    openScreenRecordingSettings: () => ok(undefined),
    getSources: () => ok([]),
    selectSource: () => ok(undefined),
    saveMedia: () => ok(undefined),
    createMeeting: async () => {
      throw new Error('Not used');
    },
    finishMeeting: async () => {
      throw new Error('Not used');
    },
    processMeeting: async () => {
      throw new Error('Not used');
    },
    clarify: async () => {
      throw new Error('Not used');
    },
    getMeeting: (id) => ok(meetings.find((meeting) => meeting.id === id)!),
    deleteMeeting: () => ok(undefined),
    openDataFolder: () => ok(undefined),
    checkLocalSetup: () => ok(readySetup),
    openSetupGuide: () => ok(undefined),
    isFullScreen: () => ok(false),
    onFullScreenChange: () => () => {},
    announceRecording: () => ok(undefined),
    onMenuBarNewRecording: () => () => {},
    onMenuBarStopRecording: () => () => {},
    getUpdateStatus: () => ok(upToDate),
    checkForUpdate: () => ok(upToDate),
    installUpdate: () => ok('started'),
    onUpdateStatus: () => () => undefined,
  };
}

export function meetingFixture(
  id: string,
  title: string,
  createdAt: string,
  extra: Partial<Meeting> = {},
): Meeting {
  return {
    id,
    title,
    createdAt,
    status: 'recorded',
    duration: 60,
    hasVideo: false,
    audioChunks: [],
    frames: [],
    transcript: [],
    notes: null,
    clarifications: [],
    error: null,
    ...extra,
  };
}
