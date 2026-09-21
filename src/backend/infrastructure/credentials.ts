import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import type { KeyProvider, Settings, SettingsInput } from '../../shared/contracts';
import { settingsSchema } from '../../shared/validation';
import { compatibleBaseUrl, isLocalCompatibleUrl } from '../../shared/compatible-url';
import { defaultOllamaModel } from './local-setup';

export interface Encryption {
  available(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
}

const storedSchema = z.object({
  encryptedKeys: z.object({
    openai: z.string().default(''),
    anthropic: z.string().default(''),
    gemini: z.string().default(''),
    compatible: z.string().default(''),
  }),
  notesProvider: z
    .enum(['openai', 'anthropic', 'gemini', 'compatible', 'ollama'])
    .default('openai'),
  transcriptionProvider: z.enum(['openai', 'gemini', 'local']).default('openai'),
  whisperModelPath: z.string().default(''),
  compatibleBaseUrl: z.string().default(''),
  model: z.string().default('gpt-4.1-mini'),
  onboardingCompleted: z.boolean().default(false),
});

type StoredSettings = z.infer<typeof storedSchema>;

const legacyDefaults: StoredSettings = {
  encryptedKeys: { openai: '', anthropic: '', gemini: '', compatible: '' },
  notesProvider: 'openai',
  transcriptionProvider: 'openai',
  whisperModelPath: '',
  compatibleBaseUrl: '',
  model: 'gpt-4.1-mini',
  onboardingCompleted: false,
};

// Seules les nouvelles installations démarrent en local ; les réglages existants sont conservés.
function newInstallation(whisperModelPath: string): StoredSettings {
  return {
    ...legacyDefaults,
    notesProvider: 'ollama',
    transcriptionProvider: 'local',
    whisperModelPath,
    model: defaultOllamaModel,
  };
}

function loadSettings(path: string, defaultWhisperModel: () => string): StoredSettings {
  if (!existsSync(path)) return newInstallation(defaultWhisperModel());
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const current = storedSchema.safeParse(raw);
  if (current.success) return current.data;
  const legacy = z
    .object({
      encryptedKey: z.string(),
      model: z.string(),
      onboardingCompleted: z.boolean().default(false),
    })
    .parse(raw);
  return {
    ...legacyDefaults,
    encryptedKeys: { ...legacyDefaults.encryptedKeys, openai: legacy.encryptedKey },
    model: legacy.model,
    onboardingCompleted: legacy.onboardingCompleted,
  };
}

export class Credentials {
  private data: StoredSettings;

  constructor(
    private readonly path: string,
    private readonly encryption: Encryption,
    defaultWhisperModel: () => string = () => '',
  ) {
    this.data = loadSettings(path, defaultWhisperModel);
  }

  settings(): Settings {
    return {
      notesProvider: this.data.notesProvider,
      transcriptionProvider: this.data.transcriptionProvider,
      hasOpenAiKey: Boolean(this.data.encryptedKeys.openai),
      hasAnthropicKey: Boolean(this.data.encryptedKeys.anthropic),
      hasGeminiKey: Boolean(this.data.encryptedKeys.gemini),
      hasCompatibleKey: Boolean(this.data.encryptedKeys.compatible),
      compatibleBaseUrl: this.data.compatibleBaseUrl,
      whisperModelPath: this.data.whisperModelPath,
      model: this.data.model,
      onboardingCompleted: this.data.onboardingCompleted,
    };
  }

  private persist(): Settings {
    writeFileSync(`${this.path}.tmp`, JSON.stringify(this.data), { mode: 0o600 });
    renameSync(`${this.path}.tmp`, this.path);
    return this.settings();
  }

  private encryptedKeysFor(settings: SettingsInput): StoredSettings['encryptedKeys'] {
    const keys: Record<KeyProvider, string> = {
      openai: settings.openAiKey,
      anthropic: settings.anthropicKey,
      gemini: settings.geminiKey,
      compatible: settings.compatibleKey,
    };
    if (Object.values(keys).some(Boolean) && !this.encryption.available()) {
      throw new Error(
        'Le chiffrement système est indisponible. Réessayez après avoir déverrouillé votre session.',
      );
    }
    const encrypted = { ...this.data.encryptedKeys };
    for (const [provider, key] of Object.entries(keys) as [KeyProvider, string][]) {
      if (key) encrypted[provider] = this.encryption.encrypt(key).toString('base64');
    }
    return encrypted;
  }

  save(input: SettingsInput): Settings {
    const settings = settingsSchema.parse(input);
    const baseUrl = settings.compatibleBaseUrl ? compatibleBaseUrl(settings.compatibleBaseUrl) : '';
    const endpointChanged = baseUrl !== this.data.compatibleBaseUrl;
    this.validateCompatibleKey(settings, baseUrl, endpointChanged);
    if (settings.transcriptionProvider === 'local') {
      const path = settings.whisperModelPath;
      if (!path || !existsSync(path) || !statSync(path).isFile()) {
        throw new Error('Choisissez un fichier de modèle Whisper valide.');
      }
    }
    const encryptedKeys = this.encryptedKeysFor(settings);
    if (endpointChanged && !settings.compatibleKey) encryptedKeys.compatible = '';
    this.data = {
      ...this.data,
      encryptedKeys,
      notesProvider: settings.notesProvider,
      transcriptionProvider: settings.transcriptionProvider,
      whisperModelPath: settings.whisperModelPath,
      compatibleBaseUrl: baseUrl,
      model: settings.model,
    };
    return this.persist();
  }

  private validateCompatibleKey(
    settings: SettingsInput,
    baseUrl: string,
    endpointChanged: boolean,
  ): void {
    if (settings.notesProvider !== 'compatible') return;
    if (isLocalCompatibleUrl(baseUrl)) return;
    if (settings.compatibleKey) return;
    if (endpointChanged || !this.data.encryptedKeys.compatible) {
      throw new Error('Ajoutez la clé de cette API distante pour cette URL.');
    }
  }

  clear(provider: KeyProvider): Settings {
    this.data.encryptedKeys[provider] = '';
    return this.persist();
  }

  completeOnboarding(): void {
    this.data.onboardingCompleted = true;
    this.persist();
  }

  key(provider: KeyProvider): string {
    const encrypted = this.data.encryptedKeys[provider];
    const name = {
      openai: 'OpenAI',
      anthropic: 'Claude',
      gemini: 'Gemini',
      compatible: 'API compatible',
    }[provider];
    if (!encrypted) {
      throw new Error(`Ajoutez votre clé ${name} dans les paramètres.`);
    }
    if (!this.encryption.available()) throw new Error('Le chiffrement système est indisponible.');
    try {
      return this.encryption.decrypt(Buffer.from(encrypted, 'base64'));
    } catch {
      throw new Error(
        `La clé ${name} enregistrée est illisible. Saisissez-la à nouveau dans les paramètres.`,
      );
    }
  }

  compatibleKey(): string {
    return this.data.encryptedKeys.compatible ? this.key('compatible') : '';
  }
}
