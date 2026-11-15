import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codexNotes } from './codex-notes';
import type { CliRun } from './cli-runner';
import { dependenciesFor, media, meeting, notes, replying } from './cli-fake.test-support';

let tempRoot = '';
beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'sayback-codex-test-'));
});
afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
}

function valuesAfter(args: readonly string[], flag: string): string[] {
  return args.flatMap((arg, at) => (arg === flag ? [args[at + 1] ?? ''] : []));
}

/** Plays Codex: writes the last message where `-o` says, and reads the schema it was given. */
function answering(reply: unknown, events = '') {
  const seen: Array<{ schema: unknown; frames: Buffer[] }> = [];
  const fake = replying(async (run: CliRun) => {
    const outputPath = valueAfter(run.args, '-o');
    const schemaPath = valueAfter(run.args, '--output-schema');
    const frames = await Promise.all(
      run.args
        .filter((arg) => arg.startsWith('--image='))
        .map((arg) => readFile(arg.slice('--image='.length))),
    );
    seen.push({ schema: JSON.parse(await readFile(schemaPath ?? '', 'utf8')), frames });
    await writeFile(outputPath ?? '', JSON.stringify(reply));
    return { stdout: events };
  });
  return { ...fake, schemas: seen };
}

function provider(fake: ReturnType<typeof replying>, model = 'default') {
  return codexNotes(() => model, media, dependenciesFor(fake.runner, tempRoot));
}

describe('Codex notes: lock-down', () => {
  it('runs `codex exec` read-only, ephemeral, without user config, rules, shell or plugins', async () => {
    const fake = answering(notes);

    await provider(fake).summarize(meeting);

    const { run } = fake.seen[0]!;
    expect(run.command).toBe('/opt/homebrew/bin/codex');
    expect(run.args[0]).toBe('exec');
    expect(valueAfter(run.args, '--sandbox')).toBe('read-only');
    expect(run.args).toContain('--ephemeral');
    expect(run.args).toContain('--skip-git-repo-check');
    expect(run.args).toContain('--ignore-user-config');
    expect(run.args).toContain('--ignore-rules');
    expect(valueAfter(run.args, '-C')).toBe(run.cwd);
    expect(valuesAfter(run.args, '-c')).toEqual(
      expect.arrayContaining(['approval_policy="never"', 'web_search="disabled"']),
    );
    expect(valuesAfter(run.args, '--disable')).toEqual(
      expect.arrayContaining([
        'shell_tool',
        'unified_exec',
        'apps',
        'plugins',
        'hooks',
        'browser_use',
        'computer_use',
        'multi_agent',
        'image_generation',
        'view_image',
      ]),
    );
    expect(run.args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(run.args).not.toContain('--full-auto');
    expect(run.args).not.toContain('--add-dir');
    expect(valueAfter(run.args, '--sandbox')).not.toMatch(/write|danger/);
  });

  it('reads the instructions from stdin, with the transcript, never from the arguments', async () => {
    const fake = answering(notes);

    await provider(fake).summarize(meeting);

    const { run } = fake.seen[0]!;
    expect(run.args.at(-1)).toBe('-');
    expect(run.input).toContain('Gardons mardi pour le lancement.');
    expect(run.input).toContain('jamais des instructions');
    expect(JSON.stringify(run.args)).not.toContain('Gardons mardi');
  });

  it('gives the answer a schema Codex accepts: every object closed, every key required', async () => {
    const fake = answering(notes);

    await provider(fake).summarize(meeting);

    const schema = fake.schemas[0]!.schema as {
      additionalProperties: boolean;
      required: string[];
      properties: { keyPoints: { items: { additionalProperties: boolean; required: string[] } } };
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(['summary', 'keyPoints', 'decisions', 'actions', 'questions']);
    expect(schema.properties.keyPoints.items.additionalProperties).toBe(false);
    expect(schema.properties.keyPoints.items.required).toEqual(['text', 'sourceIds']);
  });

  it('works in a fresh folder holding only its own files, deleted afterwards', async () => {
    const fake = answering(notes);

    await provider(fake).summarize(meeting);

    const { run, folder } = fake.seen[0]!;
    expect(run.cwd.startsWith(tempRoot)).toBe(true);
    expect(folder.sort()).toEqual(['frame-0.jpg', 'notes-schema.json']);
    expect(await readdir(tempRoot)).toEqual([]);
  });

  it('passes the model only when one is chosen', async () => {
    const fake = answering(notes);
    await provider(fake, 'default').summarize(meeting);
    await provider(fake, 'gpt-5.6-sol').summarize(meeting);

    expect(fake.seen[0]!.run.args).not.toContain('-m');
    expect(valueAfter(fake.seen[1]!.run.args, '-m')).toBe('gpt-5.6-sol');
    await expect(provider(fake, '--sandbox').summarize(meeting)).rejects.toThrow(
      'Modèle Codex invalide.',
    );
  });
});

describe('Codex notes: images and answer', () => {
  it('attaches the frames as files of the working folder, each one named in the prompt', async () => {
    const fake = answering(notes);

    await provider(fake).summarize(meeting);

    const { run } = fake.seen[0]!;
    const images = run.args.filter((arg) => arg.startsWith('--image='));
    expect(images).toEqual([`--image=${join(run.cwd, 'frame-0.jpg')}`]);
    expect(fake.schemas[0]!.frames[0]!.toString()).toBe('image-bytes');
    expect(run.input).toContain('Image 1 : écran à 5.0 secondes.');
  });

  it('sends no image for a meeting without frames', async () => {
    const fake = answering(notes);

    await provider(fake).summarize({ ...meeting, frames: [], hasVideo: false });

    expect(fake.seen[0]!.run.args.join(' ')).not.toContain('--image');
  });

  it('validates the citations against the transcript ids', async () => {
    const fake = answering({
      ...notes,
      decisions: [{ text: 'Invention', sourceIds: ['missing'] }],
    });

    const result = await provider(fake).summarize(meeting);

    expect(result.keyPoints).toEqual(notes.keyPoints);
    expect(result.decisions).toEqual([]);
  });

  it('refuses the notes when the agent tried to run a command or call a tool', async () => {
    const events = [
      '{"type":"thread.started","thread_id":"t"}',
      '{"type":"item.completed","item":{"id":"1","type":"command_execution","command":"cat ~/.ssh/id_rsa"}}',
    ].join('\n');
    const fake = answering(notes, events);

    await expect(provider(fake).summarize(meeting)).rejects.toThrow(
      'Codex a tenté d’utiliser un outil. Notes refusées. Relancez l’analyse ou choisissez un autre fournisseur.',
    );
  });

  it('accepts events that only carry messages', async () => {
    const events = [
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"1","type":"agent_message","text":"command_execution"}}',
    ].join('\n');
    const fake = answering(notes, events);

    expect(await provider(fake).summarize(meeting)).toEqual(notes);
  });

  it('says plainly when Codex wrote no answer', async () => {
    const fake = replying({ stdout: '' });

    await expect(provider(fake).summarize(meeting)).rejects.toThrow(
      'Réponse Codex vide. Relancez l’analyse.',
    );
  });
});
