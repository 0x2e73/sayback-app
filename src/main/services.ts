import { MeetingExportService } from '../backend/application/meeting-export';
import { createExportDestination } from './export-destination';
import { mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
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
import { claudeCodeNotes } from '../backend/infrastructure/claude-code-notes';
import { codexNotes } from '../backend/infrastructure/codex-notes';
import { cliDependencies } from './cli-dependencies';
import { CliSetup } from '../backend/infrastructure/cli-setup';
import type { CliNotesDependencies } from '../backend/infrastructure/cli-notes';
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
  cli: CliNotesDependencies,
): Pick<Intelligence, 'summarize'> {
  if (settings.notesProvider === 'claude-code')
    return claudeCodeNotes(() => settings.model, media, cli);
  if (settings.notesProvider === 'codex') return codexNotes(() => settings.model, media, cli);
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

function createAnalysis(
  credentials: Credentials,
  media: MediaFiles,
  cli: CliNotesDependencies,
): Intelligence {
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
  const summarizer = createSummarizer(
    settings,
    media,
    openai,
    gemini,
    anthropicKey,
    compatibleKey,
    cli,
  );
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
  // Aborted on close: a CLI still running when the app quits is stopped with it.
  const shutdown = new AbortController();
  const cli = cliDependencies(shutdown.signal, tmpdir());
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
    new CliSetup(cli),
  );
  const meetings = new MeetingService(repository, () => createAnalysis(credentials, media, cli));
  const folders = new FolderService(repository, repository);
  const recordings = new RecordingService(meetings, media);
  meetings.recover();
  return {
    meetings,
    folders,
    recordings,
    exports: new MeetingExportService(meetings, createExportDestination()),
    media,
    credentials,
    models,
    localSetup,
    close: () => {
      shutdown.abort();
      repository.close();
    },
  };
}

export type DesktopServices = ReturnType<typeof createServices>;
