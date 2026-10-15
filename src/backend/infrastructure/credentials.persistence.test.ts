import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
