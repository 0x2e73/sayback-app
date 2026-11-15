import { describe, expect, it } from 'vitest';
import { settings } from '../renderer/test-api';
import { analysisConfigured, analysisDestination } from './analysis-settings';
import type { Settings } from './contracts';
import { settingsSchema } from './validation';

const local: Settings = {
  ...settings,
  transcriptionProvider: 'local',
  whisperModelPath: '/models/ggml-base.bin',
  model: 'default',
};

describe('notes written by a CLI of the user', () => {
  it.each(['claude-code', 'codex'] as const)(
    '%s needs no key: a model choice is enough',
    (provider) => {
      expect(analysisConfigured({ ...local, notesProvider: provider })).toBe(true);
      expect(analysisConfigured({ ...local, notesProvider: provider, model: '' })).toBe(false);
    },
  );

  it('says plainly that the text leaves this computer for the account of the user', () => {
    const claude = analysisDestination({ ...local, notesProvider: 'claude-code' });
    const codex = analysisDestination({ ...local, notesProvider: 'codex' });

    expect(claude).toBe(
      'Données envoyées à Anthropic, par votre compte Claude Code, pour le texte des notes.',
    );
    expect(codex).toBe(
      'Données envoyées à OpenAI, par votre compte Codex, pour les notes et images.',
    );
  });

  it('is accepted by the settings boundary, with no key', () => {
    const input = {
      transcriptionProvider: 'local',
      openAiKey: '',
      anthropicKey: '',
      geminiKey: '',
      compatibleKey: '',
      compatibleBaseUrl: '',
      whisperModelPath: '',
      model: 'default',
    };

    expect(settingsSchema.parse({ ...input, notesProvider: 'claude-code' }).notesProvider).toBe(
      'claude-code',
    );
    expect(settingsSchema.parse({ ...input, notesProvider: 'codex' }).notesProvider).toBe('codex');
    expect(() => settingsSchema.parse({ ...input, notesProvider: 'rm -rf' })).toThrow();
  });

  it('never lets a model that reads as a command-line option through the boundary', () => {
    const input = {
      notesProvider: 'codex',
      transcriptionProvider: 'local',
      openAiKey: '',
      anthropicKey: '',
      geminiKey: '',
      compatibleKey: '',
      compatibleBaseUrl: '',
      whisperModelPath: '',
    };

    for (const model of ['--sandbox', '-m', '-', '']) {
      if (model === '') expect(settingsSchema.parse({ ...input, model }).model).toBe('');
      else expect(() => settingsSchema.parse({ ...input, model })).toThrow();
    }
    expect(settingsSchema.parse({ ...input, model: 'gpt-4.1-mini' }).model).toBe('gpt-4.1-mini');
    expect(settingsSchema.parse({ ...input, model: 'gemma3:4b' }).model).toBe('gemma3:4b');
    expect(settingsSchema.parse({ ...input, model: 'openai/gpt-4o' }).model).toBe('openai/gpt-4o');
    // A local llama.cpp or vLLM server reports its model as a path.
    for (const path of ['/models/Qwen2.5-7B-Instruct', './models/llama-3.gguf']) {
      expect(settingsSchema.parse({ ...input, model: path }).model).toBe(path);
    }
  });
});
