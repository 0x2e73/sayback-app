import type { FormEvent } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui';
import type { useSettings } from './use-settings';
import type { KeyProvider, NotesProvider, TranscriptionProvider } from '../../../shared/contracts';
import { ModelSelect } from './ModelSelect';

type FormSettings = ReturnType<typeof useSettings>;

interface ApiSettingsFormProps {
  settings: FormSettings;
}

function ProviderChoices({ settings }: ApiSettingsFormProps) {
  return (
    <div className="settings-provider-grid">
      <label className="field">
        Transcription de l’audio
        <select
          value={settings.transcriptionProvider}
          onChange={(event) =>
            settings.setTranscriptionProvider(event.target.value as TranscriptionProvider)
          }
        >
          <option value="openai">OpenAI · Whisper</option>
          <option value="gemini">Google · Gemini</option>
          <option value="local">Local · whisper.cpp</option>
        </select>
      </label>
      <label className="field">
        Compte rendu
        <select
          value={settings.notesProvider}
          onChange={(event) => settings.selectNotesProvider(event.target.value as NotesProvider)}
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Claude</option>
          <option value="gemini">Google · Gemini</option>
          <option value="compatible">API compatible OpenAI</option>
          <option value="ollama">Ollama · local</option>
        </select>
      </label>
    </div>
  );
}

interface KeyFieldProps {
  label: string;
  provider: KeyProvider;
  value: string;
  saved: boolean;
  placeholder: string;
  onChange(value: string): void;
  onClear(provider: KeyProvider): void;
}

function KeyField({
  label,
  provider,
  value,
  saved,
  placeholder,
  onChange,
  onClear,
}: KeyFieldProps) {
  return (
    <div className="settings-key-group">
      <label className="field">
        {label}
        <input
          type="password"
          autoComplete="off"
          value={value}
          placeholder={saved ? 'Une clé est enregistrée' : placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {saved && (
        <div className="settings-key-status">
          <span className="subtle-success">
            <ShieldCheck size={14} /> Clé protégée sur cet ordinateur
          </span>
          <Button type="button" variant="ghost" onClick={() => onClear(provider)}>
            Supprimer
          </Button>
        </div>
      )}
    </div>
  );
}

function ProviderKeys({ settings }: ApiSettingsFormProps) {
  const needsOpenAi =
    settings.transcriptionProvider === 'openai' || settings.notesProvider === 'openai';
  return (
    <>
      {needsOpenAi && (
        <KeyField
          label="Clé API OpenAI"
          provider="openai"
          value={settings.openAiKey}
          saved={settings.hasOpenAiKey}
          placeholder="sk-…"
          onChange={settings.setOpenAiKey}
          onClear={(provider) => void settings.clearKey(provider)}
        />
      )}
      {settings.notesProvider === 'anthropic' && (
        <KeyField
          label="Clé API Claude"
          provider="anthropic"
          value={settings.anthropicKey}
          saved={settings.hasAnthropicKey}
          placeholder="sk-ant-…"
          onChange={settings.setAnthropicKey}
          onClear={(provider) => void settings.clearKey(provider)}
        />
      )}
      {(settings.transcriptionProvider === 'gemini' || settings.notesProvider === 'gemini') && (
        <KeyField
          label="Clé API Gemini"
          provider="gemini"
          value={settings.geminiKey}
          saved={settings.hasGeminiKey}
          placeholder="Clé Google AI Studio"
          onChange={settings.setGeminiKey}
          onClear={(provider) => void settings.clearKey(provider)}
        />
      )}
      {settings.notesProvider === 'compatible' && (
        <KeyField
          label="Clé de cette API"
          provider="compatible"
          value={settings.compatibleKey}
          saved={settings.hasCompatibleKey}
          placeholder="Clé du fournisseur"
          onChange={settings.setCompatibleKey}
          onClear={(provider) => void settings.clearKey(provider)}
        />
      )}
    </>
  );
}

function ProviderDetails({ settings }: ApiSettingsFormProps) {
  return (
    <>
      <ProviderKeys settings={settings} />
      {settings.notesProvider === 'compatible' && (
        <>
          <label className="field">
            URL de base de l’API compatible
            <input
              type="url"
              value={settings.compatibleBaseUrl}
              placeholder="https://openrouter.ai/api/v1"
              onChange={(event) => settings.setCompatibleBaseUrl(event.target.value)}
            />
          </label>
          <p className="caption">
            Le modèle doit accepter les images et l’endpoint /chat/completions. Si /models n’est pas
            disponible, saisissez son ID. Sur localhost, la clé est facultative.
          </p>
        </>
      )}
      {settings.transcriptionProvider === 'local' && (
        <label className="field">
          Modèle Whisper local (.bin)
          <input
            type="text"
            value={settings.whisperModelPath}
            placeholder="/chemin/vers/ggml-large-v3-turbo.bin"
            onChange={(event) => settings.setWhisperModelPath(event.target.value)}
          />
          <small>whisper-cli et ffmpeg doivent être installés sur cet ordinateur.</small>
        </label>
      )}
      {settings.notesProvider === 'ollama' && (
        <p className="caption">
          Démarrez Ollama et installez un modèle capable de lire les images. Aucune clé API n’est
          nécessaire pour ce fournisseur local.
        </p>
      )}
    </>
  );
}

function ModelField({ settings }: ApiSettingsFormProps) {
  return (
    <>
      <div className="field">
        <span>Modèle pour les notes</span>
        {settings.notesProvider === 'compatible' ? (
          <>
            <input
              type="text"
              list="compatible-models"
              value={settings.model}
              placeholder="ex. openai/gpt-4o"
              onChange={(event) => settings.setModel(event.target.value)}
            />
            <datalist id="compatible-models">
              {settings.models.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </>
        ) : (
          <ModelSelect
            provider={settings.notesProvider}
            value={settings.model}
            models={settings.models}
            onChange={settings.setModel}
          />
        )}
      </div>
      {settings.modelsLoading && <p className="caption">Chargement des modèles…</p>}
      {settings.modelsError && (
        <p className="caption" role="status">
          {settings.modelsError}
          <Button
            type="button"
            variant="ghost"
            onClick={() => void settings.loadModels(settings.notesProvider)}
          >
            Réessayer
          </Button>
        </p>
      )}
    </>
  );
}

export function ApiSettingsForm({ settings }: ApiSettingsFormProps) {
  function submit(event: FormEvent) {
    event.preventDefault();
    void settings.save();
  }

  return (
    <form onSubmit={submit} className="settings-form">
      <ProviderChoices settings={settings} />
      <ProviderDetails settings={settings} />
      <ModelField settings={settings} />
      <div className="row">
        <Button type="submit" busy={settings.busy}>
          Enregistrer les paramètres
        </Button>
      </div>
      {settings.success && (
        <p className="subtle-success" role="status">
          <Check size={16} /> {settings.success}
        </p>
      )}
    </form>
  );
}
