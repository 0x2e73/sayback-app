import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { SettingsInput } from '../../shared/contracts';
import { Credentials } from './credentials';

let root: string;
const encryption = {
  available: () => true,
  encrypt: (text: string) => Buffer.from(text),
  decrypt: (buffer: Buffer) => buffer.toString(),
};
const input: SettingsInput = {
  notesProvider: 'codex',
  transcriptionProvider: 'openai',
  model: 'default',
  openAiKey: '',
  anthropicKey: '',
  geminiKey: '',
  compatibleKey: '',
  compatibleBaseUrl: '',
  whisperModelPath: '',
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sayback-cli-settings-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

it.each(['claude-code', 'codex'] as const)(
  'stores %s without any key and reads it back after a restart',
  (provider) => {
    const file = join(root, 'settings.json');
    new Credentials(file, encryption).save({ ...input, notesProvider: provider });

    const reread = new Credentials(file, encryption).settings();

    expect(reread).toMatchObject({ notesProvider: provider, model: 'default' });
    expect(JSON.parse(readFileSync(file, 'utf8')).encryptedKeys).toEqual({
      openai: '',
      anthropic: '',
      gemini: '',
      compatible: '',
    });
  },
);
