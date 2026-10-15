import { ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui';
import type { KeyProvider } from '../../../shared/contracts';
import type { FormSettings } from './use-settings';
import { SettingRow } from './SettingsLayout';

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
    <SettingRow label={label}>
      {({ controlId }) => (
        <>
          <input
            id={controlId}
            type="password"
            autoComplete="off"
            value={value}
            placeholder={saved ? 'Une clé est enregistrée' : placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
          {saved && (
            <div className="setting-key-status">
              <span className="setting-key-saved">
                <ShieldCheck size={14} aria-hidden="true" /> Clé protégée sur cet ordinateur
              </span>
              <Button type="button" variant="ghost" onClick={() => onClear(provider)}>
                Supprimer
              </Button>
            </div>
          )}
        </>
      )}
    </SettingRow>
  );
}

export function ProviderKeys({ settings }: { settings: FormSettings }) {
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
