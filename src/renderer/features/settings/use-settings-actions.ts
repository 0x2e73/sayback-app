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
  if (
    fields.transcriptionProvider === 'openai' &&
    !fields.openAiKey.trim() &&
    !fields.hasOpenAiKey
  ) {
    return 'Ajoutez une clé OpenAI pour transcrire l’audio.';
  }
  if (fields.transcriptionProvider === 'local' && !fields.whisperModelPath.trim()) {
    return 'Indiquez le chemin du modèle Whisper local.';
  }
  if (
    fields.transcriptionProvider === 'gemini' &&
    !fields.geminiKey.trim() &&
    !fields.hasGeminiKey
  ) {
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
      entered: fields.openAiKey.trim(),
      saved: fields.hasOpenAiKey,
      message: 'Ajoutez une clé OpenAI pour générer le compte rendu.',
    },
    anthropic: {
      entered: fields.anthropicKey.trim(),
      saved: fields.hasAnthropicKey,
      message: 'Ajoutez une clé Claude pour générer le compte rendu.',
    },
    gemini: {
      entered: fields.geminiKey.trim(),
      saved: fields.hasGeminiKey,
      message: 'Ajoutez une clé Gemini pour générer le compte rendu.',
    },
    compatible: {
      entered: fields.compatibleKey.trim(),
      saved: fields.hasCompatibleKey || isLocalCompatibleUrl(fields.compatibleBaseUrl),
      message: 'Ajoutez la clé de votre API compatible.',
    },
  };
  const selected = credentials[fields.notesProvider];
  return selected.entered || selected.saved ? '' : selected.message;
}

// A key typed now is saved first and unlocks the list, so the model can wait for it.
function missingModel(fields: Fields): string {
  if (fields.model.trim() || fields.typedKey) return '';
  const typesItsUrl = fields.notesProvider === 'compatible' && !fields.models.length;
  return typesItsUrl ? '' : 'Choisissez un modèle pour les notes.';
}

function unknownModel(fields: Fields): string {
  const listed = fields.models.includes(fields.model);
  const checked = fields.notesProvider !== 'compatible' && fields.models.length && fields.model;
  return checked && !listed ? 'Choisissez un modèle dans la liste.' : '';
}

function saveBlocker(fields: Fields): string {
  return (
    missingTranscription(fields) ||
    missingNotes(fields) ||
    missingModel(fields) ||
    unknownModel(fields)
  );
}

function inputFrom(fields: Fields): SettingsInput {
  return {
    notesProvider: fields.notesProvider,
    transcriptionProvider: fields.transcriptionProvider,
    model: fields.model,
    openAiKey: fields.openAiKey.trim(),
    anthropicKey: fields.anthropicKey.trim(),
    geminiKey: fields.geminiKey.trim(),
    compatibleKey: fields.compatibleKey.trim(),
    compatibleBaseUrl: fields.compatibleBaseUrl,
    whisperModelPath: fields.whisperModelPath,
  };
}

async function saveWithModel(
  api: DesktopApi,
  input: SettingsInput,
  currentModels: string[],
  loadModels: Fields['loadModels'],
  onSaved: (settings: Settings) => void,
): Promise<{ settings: Settings; model: string; modelsUnavailable: boolean }> {
  let settings = unwrap(await api.saveSettings(input));
  // Stored from here on: a later failure must not leave the form claiming otherwise.
  onSaved(settings);
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
    const blocker = saveBlocker(fields);
    if (blocker) {
      setError(blocker);
      return;
    }
    const input = inputFrom(fields);
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await saveWithModel(api, input, fields.models, fields.loadModels, (stored) => {
        fields.applyKeyFlags(stored);
        fields.setOpenAiKey('');
        fields.setAnthropicKey('');
        fields.setGeminiKey('');
        fields.setCompatibleKey('');
        fields.markSaved(savedFrom(input));
      });
      fields.applyKeyFlags(result.settings);
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
