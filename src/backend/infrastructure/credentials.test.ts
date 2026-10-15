import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SettingsInput } from '../../shared/contracts';
import { Credentials } from './credentials';

let root: string;
const encryption = {
  available: () => true,
  encrypt: (text: string) => Buffer.from(text.split('').reverse().join('')),
  decrypt: (buffer: Buffer) => buffer.toString().split('').reverse().join(''),
};
const input: SettingsInput = {
  notesProvider: 'openai',
  transcriptionProvider: 'openai',
  model: 'gpt-4.1-mini',
  openAiKey: '',
  anthropicKey: '',
  geminiKey: '',
  compatibleKey: '',
  compatibleBaseUrl: '',
  whisperModelPath: '',
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sayback-keys-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it('encrypts both provider keys and never returns secrets to the UI', () => {
  const file = join(root, 'settings.json');
  const settings = new Credentials(file, encryption);
  expect(
    settings.save({
      ...input,
      notesProvider: 'anthropic',
      openAiKey: 'sk-openai-private',
      anthropicKey: 'sk-ant-private',
    }),
  ).toMatchObject({
    hasOpenAiKey: true,
    hasAnthropicKey: true,
    notesProvider: 'anthropic',
  });
  const stored = readFileSync(file, 'utf8');
  expect(stored).not.toContain('sk-openai-private');
  expect(stored).not.toContain('sk-ant-private');
  const reopened = new Credentials(file, encryption);
  expect(reopened.key('openai')).toBe('sk-openai-private');
  expect(reopened.key('anthropic')).toBe('sk-ant-private');
  reopened.clear('anthropic');
  expect(reopened.key('openai')).toBe('sk-openai-private');
  expect(() => reopened.key('anthropic')).toThrow(/Claude/);
});

it('persists Gemini and compatible keys independently across restarts', () => {
  const file = join(root, 'settings.json');
  const credentials = new Credentials(file, encryption);
  credentials.save({
    ...input,
    notesProvider: 'compatible',
    transcriptionProvider: 'gemini',
    geminiKey: 'gemini-secret',
    compatibleKey: 'router-secret',
    compatibleBaseUrl: 'https://openrouter.ai/api/v1',
  });
  const stored = readFileSync(file, 'utf8');
  expect(stored).not.toContain('gemini-secret');
  expect(stored).not.toContain('router-secret');
  const reopened = new Credentials(file, encryption);
  expect(reopened.key('gemini')).toBe('gemini-secret');
  expect(reopened.key('compatible')).toBe('router-secret');
  reopened.clear('compatible');
  expect(reopened.key('gemini')).toBe('gemini-secret');
});

it('accepts a local compatible model without a key but requires one for a remote API', () => {
  const credentials = new Credentials(join(root, 'settings.json'), encryption);
  expect(() =>
    credentials.save({
      ...input,
      notesProvider: 'compatible',
      compatibleBaseUrl: 'https://openrouter.ai/api/v1',
    }),
  ).toThrow(/clé/);
  expect(
    credentials.save({
      ...input,
      notesProvider: 'compatible',
      compatibleBaseUrl: 'http://127.0.0.1:1234/v1',
      model: 'local-model',
    }),
  ).toMatchObject({ notesProvider: 'compatible', hasCompatibleKey: false });
});

it('never sends a saved compatible key to a changed endpoint', () => {
  const credentials = new Credentials(join(root, 'settings.json'), encryption);
  credentials.save({
    ...input,
    notesProvider: 'compatible',
    compatibleBaseUrl: 'https://provider-a.example/v1',
    compatibleKey: 'secret-a',
  });
  expect(() =>
    credentials.save({
      ...input,
      notesProvider: 'compatible',
      compatibleBaseUrl: 'https://provider-b.example/v1',
    }),
  ).toThrow(/clé/);
  expect(credentials.settings().compatibleBaseUrl).toBe('https://provider-a.example/v1');
  expect(credentials.key('compatible')).toBe('secret-a');
  credentials.save({
    ...input,
    notesProvider: 'compatible',
    compatibleBaseUrl: 'http://localhost:1234/v1',
  });
  expect(credentials.settings().hasCompatibleKey).toBe(false);
});

it('opens multi-provider settings from an earlier version with missing newer fields', () => {
  const file = join(root, 'settings.json');
  writeFileSync(
    file,
    JSON.stringify({
      encryptedKeys: {
        openai: '',
        anthropic: encryption.encrypt('claude-secret').toString('base64'),
      },
      notesProvider: 'anthropic',
      model: 'claude-model',
      onboardingCompleted: true,
    }),
  );
  const reopened = new Credentials(file, encryption);
  expect(reopened.settings()).toMatchObject({
    transcriptionProvider: 'openai',
    whisperModelPath: '',
    onboardingCompleted: true,
  });
  expect(reopened.key('anthropic')).toBe('claude-secret');
});

it('migrates the existing OpenAI key and preserves onboarding state', () => {
  const file = join(root, 'settings.json');
  writeFileSync(
    file,
    JSON.stringify({
      encryptedKey: encryption.encrypt('sk-existing').toString('base64'),
      model: 'gpt-4.1-mini',
      onboardingCompleted: true,
    }),
  );
  const settings = new Credentials(file, encryption);
  expect(settings.key('openai')).toBe('sk-existing');
  expect(settings.settings()).toMatchObject({
    notesProvider: 'openai',
    transcriptionProvider: 'openai',
    onboardingCompleted: true,
  });
  settings.save(input);
  expect(new Credentials(file, encryption).key('openai')).toBe('sk-existing');
});

it('starts onboarding for older settings without that field', () => {
  const file = join(root, 'settings.json');
  writeFileSync(file, JSON.stringify({ encryptedKey: '', model: 'gpt-4.1-mini' }));
  expect(new Credentials(file, encryption).settings().onboardingCompleted).toBe(false);
});

it('refuses to store a key when OS encryption is unavailable', () => {
  const settings = new Credentials(join(root, 'settings.json'), {
    available: () => false,
    encrypt: () => Buffer.alloc(0),
    decrypt: () => '',
  });
  expect(() => settings.save({ ...input, anthropicKey: 'sk-ant-private' })).toThrow(/chiffrement/i);
});

it('asks to replace a saved key when system decryption fails without deleting it', () => {
  const file = join(root, 'settings.json');
  const credentials = new Credentials(file, encryption);
  credentials.save({ ...input, openAiKey: 'sk-private' });
  const stored = readFileSync(file, 'utf8');
  const reopened = new Credentials(file, {
    ...encryption,
    decrypt: () => {
      throw new Error(
        'Error while decrypting the ciphertext provided to safeStorage.decryptString.',
      );
    },
  });

  expect(() => reopened.key('openai')).toThrow(/clé OpenAI.*paramètres/i);
  expect(readFileSync(file, 'utf8')).toBe(stored);
});

it('starts new installations on local Whisper and Ollama', () => {
  const credentials = new Credentials(
    join(root, 'settings.json'),
    encryption,
    () => '/models/ggml-base.bin',
  );
  expect(credentials.settings()).toMatchObject({
    transcriptionProvider: 'local',
    notesProvider: 'ollama',
    model: 'gemma3:4b',
    whisperModelPath: '/models/ggml-base.bin',
    onboardingCompleted: false,
  });
});

it('keeps the providers of existing installations', () => {
  const file = join(root, 'settings.json');
  new Credentials(file, encryption).save({ ...input, openAiKey: 'sk-existing' });
  expect(new Credentials(file, encryption, () => '/models/ggml-base.bin').settings()).toMatchObject(
    {
      transcriptionProvider: 'openai',
      notesProvider: 'openai',
      model: 'gpt-4.1-mini',
      whisperModelPath: '',
    },
  );
});

it('follows the system appearance until the user chooses one', () => {
  const file = join(root, 'settings.json');
  const credentials = new Credentials(file, encryption);
  expect(credentials.settings().appearance).toBe('system');
  credentials.setAppearance('dark');
  expect(new Credentials(file, encryption).settings().appearance).toBe('dark');
});

it('keeps the chosen appearance when the other settings are saved', () => {
  const credentials = new Credentials(join(root, 'settings.json'), encryption);
  credentials.setAppearance('light');
  expect(credentials.save(input).appearance).toBe('light');
});

it('opens settings from an earlier version on the system appearance', () => {
  const file = join(root, 'settings.json');
  writeFileSync(file, JSON.stringify({ encryptedKey: '', model: 'gpt-4.1-mini' }));
  expect(new Credentials(file, encryption).settings().appearance).toBe('system');
});

it('falls back to the system appearance when the stored value is unknown', () => {
  const file = join(root, 'settings.json');
  writeFileSync(
    file,
    JSON.stringify({ encryptedKeys: {}, model: 'gpt-4.1-mini', appearance: 'sepia' }),
  );
  expect(new Credentials(file, encryption).settings().appearance).toBe('system');
});

it('keeps the previous values and reports the error when the file cannot be written', () => {
  const credentials = new Credentials(join(root, 'missing', 'settings.json'), encryption);
  const before = credentials.settings();
  expect(() => credentials.setAppearance('dark')).toThrow();
  expect(() => credentials.completeOnboarding()).toThrow();
  expect(() =>
    credentials.save({ ...input, notesProvider: 'ollama', model: 'gemma3:4b' }),
  ).toThrow();
  expect(() => credentials.clear('openai')).toThrow();
  expect(credentials.settings()).toEqual(before);
});

it('does not forget a key whose removal could not be written', () => {
  const file = join(root, 'settings.json');
  const credentials = new Credentials(file, encryption);
  credentials.save({ ...input, openAiKey: 'sk-kept' });
  rmSync(root, { recursive: true, force: true });
  expect(() => credentials.clear('openai')).toThrow();
  expect(credentials.settings().hasOpenAiKey).toBe(true);
  expect(credentials.key('openai')).toBe('sk-kept');
});
