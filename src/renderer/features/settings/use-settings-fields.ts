import { useCallback, useEffect, useState } from 'react';
import {
  unwrap,
  type Appearance,
  type DesktopApi,
  type NotesProvider,
  type Settings,
} from '../../../shared/contracts';
import { errorMessage } from '../../../shared/format';
import { isLocalCompatibleUrl } from '../../../shared/compatible-url';
import { useModels } from './use-models';
import { useNotesModel } from './use-notes-model';

/** What the store holds; the form is dirty once it differs from it. */
export interface SavedFields {
  notesProvider: NotesProvider;
  transcriptionProvider: Settings['transcriptionProvider'];
  model: string;
  compatibleBaseUrl: string;
  whisperModelPath: string;
}

export function savedFrom(source: SavedFields, model = source.model): SavedFields {
  return {
    notesProvider: source.notesProvider,
    transcriptionProvider: source.transcriptionProvider,
    model,
    compatibleBaseUrl: source.compatibleBaseUrl,
    whisperModelPath: source.whisperModelPath,
  };
}

function differs(saved: SavedFields, current: SavedFields): boolean {
  return (Object.keys(saved) as (keyof SavedFields)[]).some((key) => saved[key] !== current[key]);
}

type KeyFlags = Pick<
  Settings,
  'hasOpenAiKey' | 'hasAnthropicKey' | 'hasGeminiKey' | 'hasCompatibleKey'
>;

function canListModels(
  provider: NotesProvider,
  keys: KeyFlags,
  compatibleBaseUrl: string,
): boolean {
  if (provider === 'ollama') return true;
  if (provider === 'openai') return keys.hasOpenAiKey;
  if (provider === 'anthropic') return keys.hasAnthropicKey;
  if (provider === 'gemini') return keys.hasGeminiKey;
  return keys.hasCompatibleKey || isLocalCompatibleUrl(compatibleBaseUrl);
}

function useKeyFields() {
  const [openAiKey, setOpenAiKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [compatibleKey, setCompatibleKey] = useState('');
  const [hasOpenAiKey, setHasOpenAiKey] = useState(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [hasCompatibleKey, setHasCompatibleKey] = useState(false);
  const applyKeyFlags = useCallback((stored: KeyFlags) => {
    setHasOpenAiKey(stored.hasOpenAiKey);
    setHasAnthropicKey(stored.hasAnthropicKey);
    setHasGeminiKey(stored.hasGeminiKey);
    setHasCompatibleKey(stored.hasCompatibleKey);
  }, []);
  return {
    openAiKey,
    anthropicKey,
    geminiKey,
    compatibleKey,
    hasOpenAiKey,
    hasAnthropicKey,
    hasGeminiKey,
    hasCompatibleKey,
    setOpenAiKey,
    setAnthropicKey,
    setGeminiKey,
    setCompatibleKey,
    typedKey: [openAiKey, anthropicKey, geminiKey, compatibleKey].some((key) => key.trim() !== ''),
    applyKeyFlags,
  };
}

/** The failure to read the stored settings, and the count of tries that clears it. */
function useLoadAttempt() {
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  function retryLoad() {
    setLoadError('');
    setAttempt((count) => count + 1);
  }
  return { loadError, setLoadError, attempt, retryLoad };
}

/** The settings applied at once, outside the form and its save button. */
function useInstantFields() {
  const [appearance, setAppearance] = useState<Appearance>('system');
  const [islandLiveText, setIslandLiveText] = useState(true);
  const readInstant = useCallback((settings: Settings) => {
    setAppearance(settings.appearance);
    setIslandLiveText(settings.islandLiveText);
  }, []);
  return { appearance, setAppearance, islandLiveText, setIslandLiveText, readInstant };
}

export function useSettingsFields(api: DesktopApi) {
  const [notesProvider, setNotesProvider] = useState<NotesProvider>('openai');
  const [transcriptionProvider, setTranscriptionProvider] =
    useState<Settings['transcriptionProvider']>('openai');
  const notes = useNotesModel();
  const { model, choose, reconcile } = notes;
  const keys = useKeyFields();
  const { applyKeyFlags } = keys;
  const [compatibleBaseUrl, setCompatibleBaseUrl] = useState('');
  const [whisperModelPath, setWhisperModelPath] = useState('');
  const instant = useInstantFields();
  const { readInstant } = instant;
  const { loadError, setLoadError, attempt, retryLoad } = useLoadAttempt();
  const [saved, markSaved] = useState<SavedFields | null>(null);
  const list = useModels(api);
  const { load: loadModels, clear: clearModels } = list;

  useEffect(() => {
    void api
      .getSettings()
      .then(unwrap)
      .then((settings) => {
        setNotesProvider(settings.notesProvider);
        setTranscriptionProvider(settings.transcriptionProvider);
        choose(settings.model);
        applyKeyFlags(settings);
        setCompatibleBaseUrl(settings.compatibleBaseUrl);
        setWhisperModelPath(settings.whisperModelPath);
        readInstant(settings);
        markSaved(savedFrom(settings));
        if (canListModels(settings.notesProvider, settings, settings.compatibleBaseUrl)) {
          void loadModels(settings.notesProvider).then((available) =>
            reconcile(settings.notesProvider, settings.model, available),
          );
        }
      })
      .catch((failure: unknown) => setLoadError(errorMessage(failure)));
  }, [api, loadModels, applyKeyFlags, choose, reconcile, readInstant, setLoadError, attempt]);

  function selectNotesProvider(provider: NotesProvider) {
    // Coming back to the stored provider brings its stored model back.
    const restored = saved?.notesProvider === provider ? saved.model : '';
    setNotesProvider(provider);
    notes.choose(restored);
    clearModels();
    if (!canListModels(provider, keys, compatibleBaseUrl)) return;
    void loadModels(provider).then((available) => notes.reconcile(provider, restored, available));
  }

  const current = {
    notesProvider,
    transcriptionProvider,
    model,
    compatibleBaseUrl,
    whisperModelPath,
  };
  const dirty = saved !== null && (keys.typedKey || differs(saved, current));

  return {
    notesProvider,
    transcriptionProvider,
    model,
    ...keys,
    dirty,
    /** Until the stored settings are read, the form shows placeholders. */
    loaded: saved !== null,
    markSaved,
    compatibleBaseUrl,
    whisperModelPath,
    ...instant,
    models: list.items,
    modelsLoading: list.loading,
    modelsError: list.error,
    loadError,
    selectNotesProvider,
    setTranscriptionProvider,
    setModel: notes.choose,
    removedModel: notes.removed,
    retryLoad,
    setCompatibleBaseUrl,
    setWhisperModelPath,
    loadModels,
    clearModels,
  };
}
