import type { FormEvent, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Button, Select, Skeleton, type SelectOption } from '../../components/ui';
import type { FormSettings } from './use-settings';
import { ProviderKeys } from './ProviderKeys';
import type { NotesProvider, TranscriptionProvider } from '../../../shared/contracts';
import { SettingRow, SettingsGroup, type RowIds } from './SettingsLayout';

interface ApiSettingsFormProps {
  settings: FormSettings;
}

const transcriptionOptions: readonly SelectOption[] = [
  { value: 'openai', label: 'OpenAI · Whisper' },
  { value: 'gemini', label: 'Google · Gemini' },
  { value: 'local', label: 'Local · whisper.cpp' },
];

const notesOptions: readonly SelectOption[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Claude' },
  { value: 'gemini', label: 'Google · Gemini' },
  { value: 'compatible', label: 'API compatible OpenAI' },
  { value: 'ollama', label: 'Ollama · local' },
];

function ProviderChoices({ settings }: ApiSettingsFormProps) {
  return (
    <>
      <SettingRow label="Transcription de l’audio">
        {({ controlId, labelId }) => (
          <Select
            id={controlId}
            labelledBy={labelId}
            value={settings.transcriptionProvider}
            options={transcriptionOptions}
            placeholder="Choisir un fournisseur"
            emptyMessage="Aucun fournisseur."
            onChange={(value) => settings.setTranscriptionProvider(value as TranscriptionProvider)}
          />
        )}
      </SettingRow>
      <SettingRow label="Compte rendu">
        {({ controlId, labelId }) => (
          <Select
            id={controlId}
            labelledBy={labelId}
            value={settings.notesProvider}
            options={notesOptions}
            placeholder="Choisir un fournisseur"
            emptyMessage="Aucun fournisseur."
            onChange={(value) => settings.selectNotesProvider(value as NotesProvider)}
          />
        )}
      </SettingRow>
    </>
  );
}

function ProviderDetails({ settings }: ApiSettingsFormProps) {
  return (
    <>
      {settings.transcriptionProvider === 'local' && (
        <SettingRow
          label="Modèle Whisper local"
          hint="Le fichier du modèle, au format .bin. Whisper et ffmpeg doivent être installés sur cet ordinateur."
        >
          {({ controlId, hintId }) => (
            <input
              id={controlId}
              type="text"
              aria-describedby={hintId}
              value={settings.whisperModelPath}
              placeholder="/chemin/vers/ggml-large-v3-turbo.bin"
              onChange={(event) => settings.setWhisperModelPath(event.target.value)}
            />
          )}
        </SettingRow>
      )}
      <ProviderKeys settings={settings} />
      {settings.notesProvider === 'compatible' && (
        <SettingRow
          label="Adresse de l’API (compatible OpenAI)"
          hint="Le modèle doit accepter les images. Sur votre ordinateur, la clé est facultative."
        >
          {({ controlId, hintId }) => (
            <input
              id={controlId}
              type="url"
              aria-describedby={hintId}
              value={settings.compatibleBaseUrl}
              placeholder="https://openrouter.ai/api/v1"
              onChange={(event) => settings.setCompatibleBaseUrl(event.target.value)}
            />
          )}
        </SettingRow>
      )}
    </>
  );
}

function emptyModels(provider: NotesProvider): string {
  if (provider === 'ollama') return 'Aucun modèle Ollama installé.';
  if (provider === 'compatible') return 'Saisissez l’identifiant du modèle.';
  return 'Enregistrez votre clé pour charger les modèles.';
}

function modelHint(settings: FormSettings): ReactNode {
  if (settings.modelsLoading) return <span role="status">Chargement des modèles…</span>;
  if (settings.modelsError) {
    return (
      <span role="status">
        {settings.modelsError}{' '}
        <Button
          type="button"
          variant="ghost"
          onClick={() => void settings.loadModels(settings.notesProvider)}
        >
          Réessayer
        </Button>
      </span>
    );
  }
  if (settings.removedModel) {
    return (
      <span role="status">
        Le modèle « {settings.removedModel} » n’est plus proposé, choisissez-en un.
      </span>
    );
  }
  if (settings.notesProvider === 'ollama') {
    return <>Ollama doit être démarré, avec un modèle qui lit les images.</>;
  }
  if (settings.notesProvider === 'compatible' && !settings.models.length) {
    return <>Si la liste ne se charge pas, saisissez l’identifiant du modèle.</>;
  }
  return null;
}

// One control for every case, so that typing is never interrupted by the list arriving.
function ModelControl({ settings, ids }: ApiSettingsFormProps & { ids: RowIds }) {
  const compatible = settings.notesProvider === 'compatible';
  return (
    <Select
      id={ids.controlId}
      labelledBy={ids.labelId}
      value={settings.model}
      options={settings.models.map((model) => ({ value: model, label: model }))}
      placeholder={compatible ? 'ex. openai/gpt-4o' : 'Choisir un modèle'}
      emptyMessage={emptyModels(settings.notesProvider)}
      searchLabel="Rechercher un modèle"
      allowCustom={compatible}
      onChange={settings.setModel}
    />
  );
}

function ModelField({ settings }: ApiSettingsFormProps) {
  return (
    <SettingRow label="Modèle pour les notes" hint={modelHint(settings)}>
      {(ids) => <ModelControl settings={settings} ids={ids} />}
    </SettingRow>
  );
}

function SavedSlot({ settings }: ApiSettingsFormProps) {
  // The slot is always there, so the save button never moves.
  const text = settings.success && !settings.dirty ? settings.success : '';
  return (
    <span className="settings-saved" role="status">
      {text && <Check size={16} aria-hidden="true" />}
      {text}
    </span>
  );
}

function FormSkeleton() {
  return (
    <div className="settings-rows" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div key={row} className="setting-row">
          <div className="setting-text">
            <Skeleton short />
          </div>
          <div className="setting-control">
            <Skeleton variant="block" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ApiSettingsForm({ settings }: ApiSettingsFormProps) {
  function submit(event: FormEvent) {
    event.preventDefault();
    void settings.save();
  }

  return (
    <form onSubmit={submit} aria-busy={!settings.loaded}>
      <SettingsGroup
        title="Analyse"
        description="Choisissez séparément qui transcrit l’audio et qui rédige les notes. Les clés restent chiffrées sur cet ordinateur ; les modèles locaux n’en demandent aucune."
      >
        {settings.loaded ? (
          <>
            <ProviderChoices settings={settings} />
            <ProviderDetails settings={settings} />
            <ModelField settings={settings} />
          </>
        ) : (
          <FormSkeleton />
        )}
        <div className="settings-footer">
          <Button type="submit" busy={settings.busy} disabled={!settings.dirty && !settings.busy}>
            Enregistrer
          </Button>
          <SavedSlot settings={settings} />
        </div>
      </SettingsGroup>
    </form>
  );
}
