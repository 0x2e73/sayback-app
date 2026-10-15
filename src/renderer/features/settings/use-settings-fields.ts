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
    typedKey: !!(openAiKey || anthropicKey || geminiKey || compatibleKey),
    applyKeyFlags,
  };
}

export function useSettingsFields(api: DesktopApi) {
  const [notesProvider, setNotesProvider] = useState<NotesProvider>('openai');
  const [transcriptionProvider, setTranscriptionProvider] =
    useState<Settings['transcriptionProvider']>('openai');
  const [model, setModel] = useState('gpt-4.1-mini');
  const keys = useKeyFields();
  const { applyKeyFlags } = keys;
  const [compatibleBaseUrl, setCompatibleBaseUrl] = useState('');
  const [whisperModelPath, setWhisperModelPath] = useState('');
  const [appearance, setAppearance] = useState<Appearance>('system');
  const [loadError, setLoadError] = useState('');
  const [saved, markSaved] = useState<SavedFields | null>(null);
  const {
    items: models,
    loading: modelsLoading,
    error: modelsError,
    load: loadModels,
    clear: clearModels,
  } = useModels(api);

  useEffect(() => {
    void api
      .getSettings()
      .then(unwrap)
      .then((settings) => {
        setNotesProvider(settings.notesProvider);
        setTranscriptionProvider(settings.transcriptionProvider);
        setModel(settings.model);
        applyKeyFlags(settings);
        setCompatibleBaseUrl(settings.compatibleBaseUrl);
        setWhisperModelPath(settings.whisperModelPath);
        setAppearance(settings.appearance);
        markSaved(savedFrom(settings));
        if (canListModels(settings.notesProvider, settings, settings.compatibleBaseUrl)) {
          void loadModels(settings.notesProvider).then((available) => {
            if (available.length && !available.includes(settings.model)) setModel('');
          });
        }
      })
      .catch((failure: unknown) => setLoadError(errorMessage(failure)));
  }, [api, loadModels, applyKeyFlags]);

  function selectNotesProvider(provider: NotesProvider) {
    setNotesProvider(provider);
    setModel('');
    clearModels();
    if (canListModels(provider, keys, compatibleBaseUrl)) void loadModels(provider);
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
    appearance,
    models,
    modelsLoading,
    modelsError,
    loadError,
    selectNotesProvider,
    setTranscriptionProvider,
    setModel,
    setCompatibleBaseUrl,
    setWhisperModelPath,
    setAppearance,
    loadModels,
    clearModels,
  };
}
