import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { claudeCodeNotes } from './claude-code-notes';
import { codexNotes } from './codex-notes';
import {
  CliCancelledError,
  CliTimeoutError,
  CliTooMuchOutputError,
  CliUnavailableError,
  type CliRunner,
} from './cli-runner';
import { dependenciesFor, media, meeting, replying } from './cli-fake.test-support';

let tempRoot = '';
beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'sayback-cli-errors-'));
});
afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

function failing(error: Error): CliRunner {
  return async () => {
    throw error;
  };
}

function claude(runner: CliRunner, overrides = {}) {
  return claudeCodeNotes(() => 'default', media, dependenciesFor(runner, tempRoot, overrides));
}

function codex(runner: CliRunner) {
  return codexNotes(() => 'default', media, dependenciesFor(runner, tempRoot));
}

describe('CLI notes: failures the user can act on', () => {
  it('says the CLI is not installed, without starting anything', async () => {
    const fake = replying({});

    await expect(
      claude(fake.runner, { locate: () => undefined }).summarize(meeting),
    ).rejects.toThrow('Claude Code n’est pas installé.');
    await expect(
      codexNotes(
        () => 'default',
        media,
        dependenciesFor(fake.runner, tempRoot, { locate: () => undefined }),
      ).summarize(meeting),
    ).rejects.toThrow('Codex n’est pas installé.');
    expect(fake.runner).not.toHaveBeenCalled();
  });

  it('says it too when the program vanished between the check and the start', async () => {
    await expect(claude(failing(new CliUnavailableError())).summarize(meeting)).rejects.toThrow(
      'Claude Code n’est pas installé.',
    );
  });

  it('asks to log in from the terminal when the session ended mid-run', async () => {
    const claudeLoggedOut = replying({
      exitCode: 1,
      stdout: JSON.stringify({
        type: 'result',
        is_error: true,
        result: 'Not logged in · Please run /login',
      }),
    });
    const codexLoggedOut = replying({
      exitCode: 1,
      stderr: 'ERROR: 401 Unauthorized: token expired',
    });

    await expect(claude(claudeLoggedOut.runner).summarize(meeting)).rejects.toThrow(
      'Votre session Claude Code est fermée : reconnectez-vous à Claude Code, puis réessayez.',
    );
    await expect(codex(codexLoggedOut.runner).summarize(meeting)).rejects.toThrow(
      'Votre session Codex est fermée : reconnectez-vous à Codex, puis réessayez.',
    );
  });

  it('reports a reached usage limit of the subscription', async () => {
    const fake = replying({
      exitCode: 1,
      stdout: JSON.stringify({
        type: 'result',
        is_error: true,
        result: 'Claude usage limit reached',
      }),
    });

    await expect(claude(fake.runner).summarize(meeting)).rejects.toThrow(
      'Limite de votre abonnement Claude Code atteinte. Réessayez plus tard.',
    );
  });

  it('suggests an update when the CLI does not know a lock-down option', async () => {
    const fake = replying({ exitCode: 1, stderr: "error: unknown option '--safe-mode'" });

    await expect(claude(fake.runner).summarize(meeting)).rejects.toThrow(
      'Mettez à jour Claude Code, cette version est trop ancienne.',
    );
  });

  it('reports a timeout, a runaway output and a cancellation', async () => {
    await expect(claude(failing(new CliTimeoutError())).summarize(meeting)).rejects.toThrow(
      'Claude Code a mis trop de temps. Votre enregistrement est conservé.',
    );
    await expect(claude(failing(new CliTooMuchOutputError())).summarize(meeting)).rejects.toThrow(
      'Réponse Claude Code trop volumineuse. Relancez l’analyse.',
    );
    await expect(claude(failing(new CliCancelledError())).summarize(meeting)).rejects.toThrow(
      'Analyse interrompue.',
    );
  });

  it('never repeats what the process printed: it could hold the transcript', async () => {
    const fake = replying({ exitCode: 2, stderr: 'secret meeting words Gardons mardi' });

    const failure = await claude(fake.runner)
      .summarize(meeting)
      .catch((error: Error) => error);

    expect((failure as Error).message).toBe('Claude Code n’a pas pu créer les notes. Réessayez.');
  });

  it('hands the cancellation signal to the runner', async () => {
    const controller = new AbortController();
    const fake = replying({
      stdout: JSON.stringify({ type: 'result', is_error: false, result: '{}' }),
    });

    await claude(fake.runner, { signal: controller.signal })
      .summarize(meeting)
      .catch(() => undefined);

    expect(fake.seen[0]!.run.signal).toBe(controller.signal);
  });
});
