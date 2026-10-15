import { useEffect, useState } from 'react';
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

function modelsAvailable(provider: NotesProvider, settings: Settings): boolean {
  if (provider === 'ollama') return true;
  if (provider === 'openai') return settings.hasOpenAiKey;
  if (provider === 'anthropic') return settings.hasAnthropicKey;
  if (provider === 'gemini') return settings.hasGeminiKey;
  return settings.hasCompatibleKey || isLocalCompatibleUrl(settings.compatibleBaseUrl);
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
    setHasOpenAiKey,
    setHasAnthropicKey,
    setHasGeminiKey,
    setHasCompatibleKey,
  };
}

export function useSettingsFields(api: DesktopApi) {
  const [notesProvider, setNotesProvider] = useState<NotesProvider>('openai');
  const [transcriptionProvider, setTranscriptionProvider] =
    useState<Settings['transcriptionProvider']>('openai');
  const [model, setModel] = useState('gpt-4.1-mini');
  const keys = useKeyFields();
  const { setHasOpenAiKey, setHasAnthropicKey, setHasGeminiKey, setHasCompatibleKey } = keys;
  const [compatibleBaseUrl, setCompatibleBaseUrl] = useState('');
  const [whisperModelPath, setWhisperModelPath] = useState('');
  const [appearance, setAppearance] = useState<Appearance>('system');
  const [loadError, setLoadError] = useState('');
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
        setHasOpenAiKey(settings.hasOpenAiKey);
        setHasAnthropicKey(settings.hasAnthropicKey);
        setHasGeminiKey(settings.hasGeminiKey);
        setHasCompatibleKey(settings.hasCompatibleKey);
        setCompatibleBaseUrl(settings.compatibleBaseUrl);
        setWhisperModelPath(settings.whisperModelPath);
        setAppearance(settings.appearance);
        if (modelsAvailable(settings.notesProvider, settings)) {
          void loadModels(settings.notesProvider).then((available) => {
            if (available.length && !available.includes(settings.model)) {
              setModel('');
            }
          });
        }
      })
      .catch((failure: unknown) => setLoadError(errorMessage(failure)));
  }, [api, loadModels, setHasOpenAiKey, setHasAnthropicKey, setHasGeminiKey, setHasCompatibleKey]);

  function selectNotesProvider(provider: NotesProvider) {
    setNotesProvider(provider);
    setModel('');
    clearModels();
    const ready =
      provider === 'ollama' ||
      (provider === 'openai' && keys.hasOpenAiKey) ||
      (provider === 'anthropic' && keys.hasAnthropicKey) ||
      (provider === 'gemini' && keys.hasGeminiKey) ||
      (provider === 'compatible' &&
        (keys.hasCompatibleKey || isLocalCompatibleUrl(compatibleBaseUrl)));
    if (ready) void loadModels(provider);
  }

  return {
    notesProvider,
    transcriptionProvider,
    model,
    ...keys,
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
