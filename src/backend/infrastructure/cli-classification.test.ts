import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claudeCodeNotes } from './claude-code-notes';
import { explainOutput } from './cli-failures';
import { codexNotes } from './codex-notes';
import { dependenciesFor, media, meeting, replying } from './cli-fake.test-support';

const labels = { label: 'Claude Code' };
const closed =
  'Votre session Claude Code est fermée : reconnectez-vous à Claude Code, puis réessayez.';
const generic = 'Claude Code n’a pas pu créer les notes. Réessayez.';

describe('explainOutput reads an error text, with precise patterns', () => {
  it('tells a closed session from words that merely contain "log"', () => {
    expect(explainOutput('Not logged in · Please run /login', labels)).toBe(closed);
    expect(explainOutput('please log in again', labels)).toBe(closed);
    expect(explainOutput('Failed to login', labels)).toBe(closed);
    expect(explainOutput('backlog interne, catalogue, blog', labels)).toBe(generic);
  });

  it('reads a status code only when it sits next to HTTP, status or error', () => {
    expect(explainOutput('API Error: 401 {"type":"error"}', labels)).toBe(closed);
    expect(explainOutput('HTTP 401', labels)).toBe(closed);
    expect(explainOutput('{"output_tokens":401,"cache":429}', labels)).toBe(generic);
    expect(explainOutput('request took 401 ms for 429 items', labels)).toBe(generic);
    expect(explainOutput('status: 429', labels)).toBe(
      'Limite de votre abonnement Claude Code atteinte. Réessayez plus tard.',
    );
  });
});

describe('what the CLI says versus what the model wrote', () => {
  let tempRoot = '';
  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'sayback-classification-'));
  });
  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it('ignores the model content of a Claude run that failed on the network', async () => {
    const fake = replying({
      exitCode: 1,
      stdout: JSON.stringify({
        type: 'result',
        is_error: false,
        result: 'Le backlog interne : connectez-vous, erreur 401, limite atteinte',
      }),
      stderr: 'getaddrinfo ENOTFOUND api.anthropic.com',
    });
    const provider = claudeCodeNotes(
      () => 'default',
      media,
      dependenciesFor(fake.runner, tempRoot),
    );

    await expect(provider.summarize(meeting)).rejects.toThrow(generic);
  });

  it('reads the result of Claude only when it is flagged as an error', async () => {
    const fake = replying({
      exitCode: 1,
      stdout: JSON.stringify({ type: 'result', is_error: true, result: 'Please run /login' }),
    });
    const provider = claudeCodeNotes(
      () => 'default',
      media,
      dependenciesFor(fake.runner, tempRoot),
    );

    await expect(provider.summarize(meeting)).rejects.toThrow(closed);
  });

  it('ignores the model messages of a Codex run that failed on the network', async () => {
    const events = [
      '{"type":"item.completed","item":{"id":"1","type":"agent_message","text":"backlog, log in, 401, usage limit"}}',
    ].join('\n');
    const fake = replying({ exitCode: 1, stdout: events, stderr: 'connection reset by peer' });
    const provider = codexNotes(() => 'default', media, dependenciesFor(fake.runner, tempRoot));

    await expect(provider.summarize(meeting)).rejects.toThrow(
      'Codex n’a pas pu créer les notes. Réessayez.',
    );
  });

  it('reads the error and turn.failed messages of Codex', async () => {
    const loggedOut = replying({
      exitCode: 1,
      stdout: '{"type":"turn.failed","error":{"message":"401 Unauthorized: token expired"}}',
    });
    const limited = replying({
      exitCode: 1,
      stdout: '{"type":"error","message":"You\'ve hit your usage limit"}',
    });
    const make = (fake: ReturnType<typeof replying>) =>
      codexNotes(() => 'default', media, dependenciesFor(fake.runner, tempRoot));

    await expect(make(loggedOut).summarize(meeting)).rejects.toThrow(
      'Votre session Codex est fermée : reconnectez-vous à Codex, puis réessayez.',
    );
    await expect(make(limited).summarize(meeting)).rejects.toThrow(
      'Limite de votre abonnement Codex atteinte. Réessayez plus tard.',
    );
  });
});
