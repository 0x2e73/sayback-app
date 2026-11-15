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
});
