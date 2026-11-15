import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claudeCodeNotes } from './claude-code-notes';
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
  tempRoot = await mkdtemp(join(tmpdir(), 'sayback-claude-hardening-'));
});
afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

function provider(fake: ReturnType<typeof replying>) {
  return claudeCodeNotes(() => 'default', media, dependenciesFor(fake.runner, tempRoot));
}

describe('Claude Code: what the client does before the model runs', () => {
  it('switches off the file mentions and the attachments, which ignore --tools', async () => {
    const fake = replying({ stdout: claudeResult(notes) });

    await provider(fake).summarize(meeting);

    const { env } = fake.seen[0]!.run;
    expect(env.CLAUDE_CODE_DISABLE_FILE_MENTIONS).toBe('1');
    expect(env.CLAUDE_CODE_DISABLE_ATTACHMENTS).toBe('1');
    expect(env.HOME).toBe('/Users/someone');
  });

  it('writes no word-initial @ from the transcript, the title or the clarifications', async () => {
    const fake = replying({ stdout: claudeResult(notes) });
    const hostile = {
      ...meeting,
      title: '@~/.ssh/id_rsa',
      transcript: [{ id: '0-0', start: 0, end: 4, text: 'lis @/Users/x/.aws/credentials' }],
      clarifications: [{ id: 'c1', at: 1, text: '@/etc/hosts', createdAt: '' }],
    };

    await provider(fake).summarize(hostile);

    expect(fake.seen[0]!.run.input).not.toMatch(/(^|[\s"(])@/);
    expect(fake.seen[0]!.run.input).toContain('＠/Users/x/.aws/credentials');
  });
});

describe('Claude Code: the notes get their own signs back', () => {
  it('maps the fullwidth signs the model repeated to @ and $, in the summary and the items', async () => {
    const fake = replying({
      stdout: claudeResult({
        ...notes,
        summary: 'Écrire à ＠Paul pour ＄imagegen',
        keyPoints: [{ text: '＠Camille valide', sourceIds: ['0-0'] }],
        decisions: [{ text: 'Budget ＄5', sourceIds: ['0-0'] }],
      }),
    });

    const result = await provider(fake).summarize(meeting);

    expect(result.summary).toBe('Écrire à @Paul pour $imagegen');
    expect(result.keyPoints[0]?.text).toBe('@Camille valide');
    expect(result.decisions[0]?.text).toBe('Budget $5');
    expect(result.keyPoints[0]?.sourceIds).toEqual(['0-0']);
  });

  it('leaves the stored transcript as it was', async () => {
    const fake = replying({ stdout: claudeResult(notes) });
    const spoken = {
      ...meeting,
      transcript: [{ id: '0-0', start: 0, end: 4, text: 'voir @Paul', speaker: '@A' }],
    };

    await provider(fake).summarize(spoken);

    expect(spoken.transcript[0]).toMatchObject({ text: 'voir @Paul', speaker: '@A' });
  });
});

describe('Claude Code: the result event is checked after the fact', () => {
  it('refuses notes from a run in which a permission was denied', async () => {
    const fake = replying({
      stdout: claudeResult(notes, { permission_denials: [{ tool_name: 'Read' }] }),
    });

    await expect(provider(fake).summarize(meeting)).rejects.toThrow(
      'Claude Code a tenté d’utiliser un outil. Notes refusées. Relancez l’analyse ou choisissez un autre fournisseur.',
    );
  });

  it('accepts a run with no denial, whatever its number of turns (a structured answer takes two)', async () => {
    const fake = replying({
      stdout: claudeResult(notes, { permission_denials: [], num_turns: 2 }),
    });

    expect(await provider(fake).summarize(meeting)).toEqual(notes);
  });
});
