import { readdir } from 'node:fs/promises';
import { vi } from 'vitest';
import type { Meeting } from '../../shared/contracts';
import type { CliNotesDependencies } from './cli-notes';
import type { CliOutput, CliRun, CliRunner } from './cli-runner';

// The runner is faked: no test here starts a real CLI or makes a paid call.
export const meeting: Meeting = {
  id: 'meeting',
  title: 'Revue produit',
  createdAt: '',
  status: 'recorded',
  duration: 30,
  hasVideo: true,
  audioChunks: [],
  frames: [{ index: 0, at: 5 }],
  transcript: [{ id: '0-0', start: 0, end: 4, text: 'Gardons mardi pour le lancement.' }],
  notes: null,
  clarifications: [],
  error: null,
};

export const notes = {
  summary: 'La date reste mardi.',
  keyPoints: [{ text: 'Lancement mardi', sourceIds: ['0-0'] }],
  decisions: [],
  actions: [],
  questions: [],
};

export const media = {
  readAudio: async () => Buffer.from('audio'),
  readFrame: async () => Buffer.from('image-bytes'),
};

export interface Seen {
  run: CliRun;
  /** What the working folder held while the process was running. */
  folder: string[];
}

export function replying(
  output: Partial<CliOutput> | ((run: CliRun) => Promise<Partial<CliOutput>> | Partial<CliOutput>),
) {
  const seen: Seen[] = [];
  const runner: CliRunner = async (run) => {
    seen.push({ run, folder: await readdir(run.cwd) });
    const answer = typeof output === 'function' ? await output(run) : output;
    return { exitCode: 0, stdout: '', stderr: '', ...answer };
  };
  return { runner: vi.fn(runner), seen };
}

export function dependenciesFor(
  runner: CliRunner,
  tempRoot: string,
  overrides: Partial<CliNotesDependencies> = {},
): CliNotesDependencies {
  return {
    runner,
    locate: (name) => `/opt/homebrew/bin/${name}`,
    environment: {
      HOME: '/Users/someone',
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      OPENAI_API_KEY: 'sk-secret',
      GITHUB_TOKEN: 'ghp-secret',
    },
    tempRoot,
    ...overrides,
  };
}

/** The `result` event of `claude -p --output-format json`. */
export function claudeResult(payload: unknown, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: JSON.stringify(payload),
    ...extra,
  });
}

/** What a text-only `codex exec --json` run prints, around the events a test adds. */
export function codexStream(...middle: string[]): string {
  return [
    '{"type":"thread.started","thread_id":"t"}',
    '{"type":"turn.started"}',
    ...middle,
    '{"type":"turn.completed","usage":{}}',
  ].join('\n');
}
