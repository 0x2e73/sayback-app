import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claudeCodeNotes } from './claude-code-notes';
import { UngroundedNotesError } from './notes-context';
import {
  claudeResult,
  dependenciesFor,
  media,
  meeting,
  notes,
  replying,
} from './cli-fake.test-support';

let tempRoot = '';
beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'sayback-claude-test-'));
});
afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

function provider(fake: ReturnType<typeof replying>, model = 'default') {
  return claudeCodeNotes(() => model, media, dependenciesFor(fake.runner, tempRoot));
}

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

describe('Claude Code notes: lock-down', () => {
  it('runs the CLI with every tool, MCP server, setting and hook switched off', async () => {
    const fake = replying({ stdout: claudeResult(notes) });

    await provider(fake).summarize(meeting);

    const { run } = fake.seen[0]!;
    expect(run.command).toBe('/opt/homebrew/bin/claude');
    expect(run.args).toContain('-p');
    expect(valueAfter(run.args, '--output-format')).toBe('json');
    expect(valueAfter(run.args, '--tools')).toBe('');
    expect(run.args).toContain('--strict-mcp-config');
    expect(run.args).not.toContain('--mcp-config');
    expect(run.args).toContain('--safe-mode');
    expect(valueAfter(run.args, '--setting-sources')).toBe('');
    expect(run.args).toContain('--disable-slash-commands');
    expect(run.args).toContain('--no-session-persistence');
    expect(valueAfter(run.args, '--permission-mode')).toBe('dontAsk');
    expect(valueAfter(run.args, '--permission-prompts')).toBe('none');
    expect(run.args).not.toContain('--dangerously-skip-permissions');
    expect(run.args).not.toContain('--allow-dangerously-skip-permissions');
    expect(run.args).not.toContain('--add-dir');
    expect(JSON.parse(valueAfter(run.args, '--json-schema') ?? '')).toMatchObject({
      type: 'object',
      required: ['summary', 'keyPoints', 'decisions', 'actions', 'questions'],
    });
  });

  it('sends the transcript on stdin only, never in the arguments', async () => {
    const fake = replying({ stdout: claudeResult(notes) });

    await provider(fake).summarize(meeting);

    const { run } = fake.seen[0]!;
    expect(run.input).toContain('Gardons mardi pour le lancement.');
    expect(JSON.stringify(run.args)).not.toContain('Gardons mardi');
  });

  it('works in a fresh empty folder that is deleted afterwards, success or not', async () => {
    const fake = replying({ stdout: claudeResult(notes) });
    await provider(fake).summarize(meeting);
    const failing = replying({ exitCode: 1, stderr: 'boom' });
    await expect(provider(failing).summarize(meeting)).rejects.toThrow();

    for (const { run, folder } of [...fake.seen, ...failing.seen]) {
      expect(run.cwd.startsWith(tempRoot)).toBe(true);
      expect(folder).toEqual([]);
      await expect(stat(run.cwd)).rejects.toThrow();
    }
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it('gives the process a minimal environment without any API key or token', async () => {
    const fake = replying({ stdout: claudeResult(notes) });

    await provider(fake).summarize(meeting);

    const { env } = fake.seen[0]!.run;
    expect(env.HOME).toBe('/Users/someone');
    expect(env.PATH).toContain('/opt/homebrew/bin');
    expect(Object.keys(env).join()).not.toMatch(/KEY|TOKEN|SECRET/);
  });

  it('bounds the run in time and in output size', async () => {
    const fake = replying({ stdout: claudeResult(notes) });

    await provider(fake).summarize(meeting);

    const { run } = fake.seen[0]!;
    expect(run.timeoutMs).toBeGreaterThan(0);
    expect(run.timeoutMs).toBeLessThanOrEqual(600_000);
    expect(run.maxOutputBytes).toBeGreaterThan(0);
    expect(run.maxOutputBytes).toBeLessThanOrEqual(4_000_000);
  });

  it('passes the model only when one is chosen, and never one that looks like a flag', async () => {
    const fake = replying({ stdout: claudeResult(notes) });
    await provider(fake, 'default').summarize(meeting);
    await provider(fake, 'sonnet').summarize(meeting);

    expect(fake.seen[0]!.run.args).not.toContain('--model');
    expect(valueAfter(fake.seen[1]!.run.args, '--model')).toBe('sonnet');
    await expect(
      provider(fake, '--dangerously-skip-permissions').summarize(meeting),
    ).rejects.toThrow('Modèle Claude Code invalide.');
    expect(fake.seen).toHaveLength(2);
  });

  it('sends the text only: the frames stay on this computer', async () => {
    const fake = replying({ stdout: claudeResult(notes) });

    await provider(fake).summarize(meeting);

    expect(fake.seen[0]!.run.input).not.toContain('image-bytes');
    expect(fake.seen[0]!.run.args.join(' ')).not.toMatch(/\.jpe?g|--image/);
  });
});

describe('Claude Code notes: answer', () => {
  it('validates the citations against the transcript ids', async () => {
    const fake = replying({
      stdout: claudeResult({
        ...notes,
        decisions: [{ text: 'Invention', sourceIds: ['missing'] }],
      }),
    });

    const result = await provider(fake).summarize(meeting);

    expect(result.keyPoints).toEqual(notes.keyPoints);
    expect(result.decisions).toEqual([]);
  });

  it('refuses notes that cite nothing real', async () => {
    const fake = replying({
      stdout: claudeResult({
        ...notes,
        keyPoints: [{ text: 'Invention', sourceIds: ['missing'] }],
      }),
    });

    await expect(provider(fake).summarize(meeting)).rejects.toBeInstanceOf(UngroundedNotesError);
  });

  it('reads the structured output when the CLI returns one', async () => {
    const fake = replying({
      stdout: JSON.stringify({
        type: 'result',
        is_error: false,
        result: '',
        structured_output: notes,
      }),
    });

    expect(await provider(fake).summarize(meeting)).toEqual(notes);
  });

  it('says plainly when the answer is not the notes', async () => {
    const fake = replying({
      stdout: JSON.stringify({ type: 'result', is_error: false, result: 'Voici les notes !' }),
    });

    await expect(provider(fake).summarize(meeting)).rejects.toThrow(
      'Réponse Claude Code incomplète. Relancez l’analyse.',
    );
  });
});
