import { useState } from 'react';
import {
  unwrap,
  type DesktopApi,
  type Settings,
  type SettingsInput,
} from '../../../shared/contracts';
import { errorMessage } from '../../../shared/format';
import { isLocalCompatibleUrl } from '../../../shared/compatible-url';
import { savedFrom, type useSettingsFields } from './use-settings-fields';

type Fields = ReturnType<typeof useSettingsFields>;

function missingTranscription(fields: Fields): string {
  if (fields.transcriptionProvider === 'openai' && !fields.openAiKey && !fields.hasOpenAiKey) {
    return 'Ajoutez une clé OpenAI pour transcrire l’audio.';
  }
  if (fields.transcriptionProvider === 'local' && !fields.whisperModelPath.trim()) {
    return 'Indiquez le chemin du modèle Whisper local.';
  }
  if (fields.transcriptionProvider === 'gemini' && !fields.geminiKey && !fields.hasGeminiKey) {
    return 'Ajoutez une clé Gemini pour transcrire l’audio.';
  }
  return '';
}

function missingNotes(fields: Fields): string {
  if (fields.notesProvider === 'ollama') {
    return fields.model ? '' : 'Choisissez un modèle Ollama installé.';
  }
  if (fields.notesProvider === 'compatible' && !fields.compatibleBaseUrl.trim()) {
    return 'Indiquez l’URL de votre API compatible.';
  }
  const credentials = {
    openai: {
      entered: fields.openAiKey,
      saved: fields.hasOpenAiKey,
      message: 'Ajoutez une clé OpenAI pour générer le compte rendu.',
    },
    anthropic: {
      entered: fields.anthropicKey,
      saved: fields.hasAnthropicKey,
      message: 'Ajoutez une clé Claude pour générer le compte rendu.',
    },
    gemini: {
      entered: fields.geminiKey,
      saved: fields.hasGeminiKey,
      message: 'Ajoutez une clé Gemini pour générer le compte rendu.',
    },
    compatible: {
      entered: fields.compatibleKey,
      saved: fields.hasCompatibleKey || isLocalCompatibleUrl(fields.compatibleBaseUrl),
      message: 'Ajoutez la clé de votre API compatible.',
    },
  };
  const selected = credentials[fields.notesProvider];
  return selected.entered || selected.saved ? '' : selected.message;
}

async function saveWithModel(
  api: DesktopApi,
  input: SettingsInput,
  currentModels: string[],
  loadModels: Fields['loadModels'],
): Promise<{ settings: Settings; model: string; modelsUnavailable: boolean }> {
  let settings = unwrap(await api.saveSettings(input));
  if (input.notesProvider === 'compatible' && input.model) {
    void loadModels(input.notesProvider);
    return { settings, model: input.model, modelsUnavailable: false };
  }
  if (
    !input.openAiKey &&
    !input.anthropicKey &&
    !input.geminiKey &&
    !input.compatibleKey &&
    currentModels.length
  ) {
    return { settings, model: input.model, modelsUnavailable: false };
  }
  const available = await loadModels(input.notesProvider);
  if (!available.length) return { settings, model: input.model, modelsUnavailable: true };
  if (available.includes(input.model)) {
    return { settings, model: input.model, modelsUnavailable: false };
  }
  if (input.model) {
    settings = unwrap(
      await api.saveSettings({
        ...input,
        model: '',
        openAiKey: '',
        anthropicKey: '',
        geminiKey: '',
        compatibleKey: '',
      }),
    );
  }
  return { settings, model: '', modelsUnavailable: false };
}

export function useSettingsActions(api: DesktopApi, fields: Fields) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function save() {
    const missing = missingTranscription(fields) || missingNotes(fields);
    if (missing) {
      setError(missing);
      return;
    }
    if (
      fields.notesProvider !== 'compatible' &&
      fields.models.length &&
      fields.model &&
      !fields.models.includes(fields.model)
    ) {
      setError('Choisissez un modèle dans la liste.');
      return;
    }
    const input: SettingsInput = {
      notesProvider: fields.notesProvider,
      transcriptionProvider: fields.transcriptionProvider,
      model: fields.model,
      openAiKey: fields.openAiKey,
      anthropicKey: fields.anthropicKey,
      geminiKey: fields.geminiKey,
      compatibleKey: fields.compatibleKey,
      compatibleBaseUrl: fields.compatibleBaseUrl,
      whisperModelPath: fields.whisperModelPath,
    };
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await saveWithModel(api, input, fields.models, fields.loadModels);
      fields.applyKeyFlags(result.settings);
      fields.setOpenAiKey('');
      fields.setAnthropicKey('');
      fields.setGeminiKey('');
      fields.setCompatibleKey('');
      fields.setModel(result.model);
      fields.markSaved(savedFrom(input, result.model));
      if (result.modelsUnavailable) {
        setError('Clé enregistrée, mais les modèles restent indisponibles. Réessayez.');
      } else if (!result.model) {
        setSuccess('Clé enregistrée. Choisissez un modèle pour les notes.');
      } else {
        setSuccess('Enregistré');
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function clearKey(provider: 'openai' | 'anthropic' | 'gemini' | 'compatible') {
    try {
      const settings = unwrap(await api.clearApiKey(provider));
      fields.applyKeyFlags(settings);
      if (fields.notesProvider === provider) fields.clearModels();
      setSuccess('Clé supprimée.');
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  async function openFolder() {
    try {
      unwrap(await api.openDataFolder());
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  return { busy, error: error || fields.loadError, success, save, clearKey, openFolder };
}
