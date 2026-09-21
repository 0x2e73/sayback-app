import { afterEach, beforeEach, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findWhisperModel, LocalSetup } from './local-setup';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sayback-setup-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function modelFile(folder: string, name: string): string {
  mkdirSync(join(root, folder), { recursive: true });
  const path = join(root, folder, name);
  writeFileSync(path, 'model');
  return path;
}

function tags(names: string[]): typeof fetch {
  return async () => Response.json({ models: names.map((name) => ({ name })) });
}

const unreachable: typeof fetch = async () => {
  throw new TypeError('fetch failed');
};

it('finds a multilingual Whisper model and ignores English-only files', () => {
  modelFile('guide', 'ggml-base.en.bin');
  modelFile('guide', 'notes.txt');
  const expected = modelFile('other', 'ggml-small.bin');
  expect(findWhisperModel([join(root, 'missing'), join(root, 'guide'), join(root, 'other')])).toBe(
    expected,
  );
});

it('returns no Whisper model when none is installed', () => {
  expect(findWhisperModel([join(root, 'missing')])).toBe('');
});

it('reports a complete local setup', async () => {
  const model = modelFile('models', 'ggml-base.bin');
  const setup = new LocalSetup({
    locate: (name) => `/opt/homebrew/bin/${name}`,
    whisperModelPath: () => model,
    notesModel: () => 'gemma3:4b',
    request: tags(['gemma3:4b', 'llama3:8b']),
  });
  expect(await setup.check()).toEqual({
    whisperCli: true,
    ffmpeg: true,
    whisperModel: true,
    ollama: true,
    notesModel: true,
    notesModelName: 'gemma3:4b',
  });
});

it('reports what is missing when tools, models and Ollama are absent', async () => {
  const setup = new LocalSetup({
    locate: (name) => (name === 'ffmpeg' ? '/usr/local/bin/ffmpeg' : undefined),
    whisperModelPath: () => join(root, 'deleted.bin'),
    notesModel: () => 'gemma3:4b',
    request: unreachable,
  });
  expect(await setup.check()).toEqual({
    whisperCli: false,
    ffmpeg: true,
    whisperModel: false,
    ollama: false,
    notesModel: false,
    notesModelName: 'gemma3:4b',
  });
});

it('reports a running Ollama without the notes model', async () => {
  const setup = new LocalSetup({
    locate: () => undefined,
    whisperModelPath: () => '',
    notesModel: () => 'gemma3:4b',
    request: tags(['gemma3:1b']),
  });
  expect(await setup.check()).toMatchObject({ ollama: true, notesModel: false });
});

it('accepts an untagged notes model installed as latest', async () => {
  const setup = new LocalSetup({
    locate: () => undefined,
    whisperModelPath: () => '',
    notesModel: () => 'qwen3-vl',
    request: tags(['qwen3-vl:latest']),
  });
  expect(await setup.check()).toMatchObject({ notesModel: true });
});
