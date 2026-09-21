import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import OpenAI from 'openai';
import { MeetingService } from '../backend/application/meetings';
import { FolderService } from '../backend/application/folders';
import { SqliteMeetings } from '../backend/infrastructure/sqlite-meetings';
import { MediaFiles } from '../backend/infrastructure/media-files';
import { Credentials, type Encryption } from '../backend/infrastructure/credentials';
import { OpenAiIntelligence } from '../backend/infrastructure/openai-intelligence';
import { OpenAiModels } from '../backend/infrastructure/openai-models';
import { AnthropicNotes } from '../backend/infrastructure/anthropic-notes';
import { OllamaNotes } from '../backend/infrastructure/ollama-notes';
import { LocalWhisper, locateBinary } from '../backend/infrastructure/local-whisper';
import {
  defaultOllamaModel,
  findWhisperModel,
  LocalSetup,
  whisperModelFolders,
} from '../backend/infrastructure/local-setup';
import { ProviderModels } from '../backend/infrastructure/provider-models';
import { GeminiIntelligence } from '../backend/infrastructure/gemini-intelligence';
import { CompatibleNotes } from '../backend/infrastructure/compatible-notes';
import { RecordingService } from '../backend/application/recordings';
import type { Intelligence } from '../backend/application/ports';
import type { Settings } from '../shared/contracts';

function createTranscriber(
  settings: Settings,
  media: MediaFiles,
  openai: OpenAiIntelligence,
  gemini: GeminiIntelligence,
) {
  if (settings.transcriptionProvider === 'local')
    return new LocalWhisper(media, () => settings.whisperModelPath);
  if (settings.transcriptionProvider === 'gemini') return gemini;
  return openai;
}

function createSummarizer(
  settings: Settings,
  media: MediaFiles,
  openai: OpenAiIntelligence,
  gemini: GeminiIntelligence,
  anthropicKey: string,
  compatibleKey: string,
): Pick<Intelligence, 'summarize'> {
  if (settings.notesProvider === 'anthropic')
    return new AnthropicNotes(
      () => anthropicKey,
      () => settings.model,
      media,
    );
  if (settings.notesProvider === 'ollama') return new OllamaNotes(() => settings.model, media);
  if (settings.notesProvider === 'gemini') return gemini;
  if (settings.notesProvider === 'compatible') {
    return new CompatibleNotes(
      () => settings.compatibleBaseUrl,
      () => compatibleKey,
      () => settings.model,
      media,
    );
  }
  return openai;
}

function createAnalysis(credentials: Credentials, media: MediaFiles): Intelligence {
  const settings = credentials.settings();
  const needsOpenAi =
    settings.transcriptionProvider === 'openai' || settings.notesProvider === 'openai';
  const openAiKey = needsOpenAi ? credentials.key('openai') : '';
  const anthropicKey = settings.notesProvider === 'anthropic' ? credentials.key('anthropic') : '';
  const needsGemini =
    settings.transcriptionProvider === 'gemini' || settings.notesProvider === 'gemini';
  const geminiKey = needsGemini ? credentials.key('gemini') : '';
  const compatibleKey = settings.notesProvider === 'compatible' ? credentials.compatibleKey() : '';
  const openai = new OpenAiIntelligence(
    () => new OpenAI({ apiKey: openAiKey, timeout: 120_000, maxRetries: 1 }),
    media,
    () => settings.model,
  );
  const gemini = new GeminiIntelligence(
    () => geminiKey,
    () => settings.model,
    media,
  );
  const transcriber = createTranscriber(settings, media, openai, gemini);
  const summarizer = createSummarizer(settings, media, openai, gemini, anthropicKey, compatibleKey);
  return {
    transcriptionConcurrency: settings.transcriptionProvider === 'local' ? 1 : 3,
    transcribe: (id, chunk) => transcriber.transcribe(id, chunk),
    summarize: (meeting) => summarizer.summarize(meeting),
  };
}

export function createServices(root: string, encryption: Encryption) {
  mkdirSync(root, { recursive: true });
  const repository = new SqliteMeetings(join(root, 'meetings.sqlite'));
  const media = new MediaFiles(join(root, 'recordings'));
  const credentials = new Credentials(join(root, 'settings.json'), encryption, () =>
    findWhisperModel(whisperModelFolders(homedir())),
  );
  const localSetup = new LocalSetup({
    locate: locateBinary,
    whisperModelPath: () => credentials.settings().whisperModelPath,
    notesModel: () => {
      const settings = credentials.settings();
      return settings.notesProvider === 'ollama' ? settings.model : defaultOllamaModel;
    },
    request: fetch,
  });
  const models = new ProviderModels(
    new OpenAiModels(
      () => new OpenAI({ apiKey: credentials.key('openai'), timeout: 20_000, maxRetries: 1 }),
    ),
    () => credentials.key('anthropic'),
    fetch,
    () => credentials.key('gemini'),
    () => ({
      key: credentials.compatibleKey(),
      baseUrl: credentials.settings().compatibleBaseUrl,
    }),
  );
  const meetings = new MeetingService(repository, () => createAnalysis(credentials, media));
  const folders = new FolderService(repository, repository);
  const recordings = new RecordingService(meetings, media);
  meetings.recover();
  return {
    meetings,
    folders,
    recordings,
    media,
    credentials,
    models,
    localSetup,
    close: () => repository.close(),
  };
}

export type DesktopServices = ReturnType<typeof createServices>;
