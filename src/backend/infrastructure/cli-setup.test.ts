import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliSetup } from './cli-setup';
import { CliUnavailableError, type CliOutput, type CliRun, type CliRunner } from './cli-runner';
import { dependenciesFor } from './cli-fake.test-support';

let tempRoot = '';
beforeEach(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), 'sayback-cli-setup-'));
});
afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

function setup(answers: Record<string, Partial<CliOutput> | Error>, overrides = {}) {
  const runs: CliRun[] = [];
  const runner: CliRunner = async (run) => {
    runs.push(run);
    const answer = answers[run.args.join(' ')];
    if (answer instanceof Error) throw answer;
    return { exitCode: 0, stdout: '', stderr: '', ...answer };
  };
  return { runs, setup: new CliSetup(dependenciesFor(runner, tempRoot, overrides)) };
}

const loggedIn = JSON.stringify({ loggedIn: true, authMethod: 'claude.ai' });
const catalog = JSON.stringify({
  models: [
    { slug: 'gpt-a', visibility: 'list' },
    { slug: 'gpt-hidden', visibility: 'hide' },
    { slug: 'gpt-b', visibility: 'list' },
  ],
});

describe('Claude Code setup', () => {
  it('offers the default and the model aliases once logged in, with a read-only status call', async () => {
    const { runs, setup: tool } = setup({ 'auth status': { stdout: loggedIn } });

    expect(await tool.models('claude-code')).toEqual(['default', 'sonnet', 'opus', 'haiku']);

    expect(runs).toHaveLength(1);
    expect(runs[0]!.command).toBe('/opt/homebrew/bin/claude');
    expect(runs[0]!.timeoutMs).toBe(20_000);
    expect(runs[0]!.maxOutputBytes).toBe(2_000_000);
    expect(Object.keys(runs[0]!.env).join()).not.toMatch(/KEY|TOKEN|SECRET/);
  });

  it('says plainly when it is not installed', async () => {
    const { setup: tool } = setup({}, { locate: () => undefined });
    await expect(tool.models('claude-code')).rejects.toThrow('Claude Code n’est pas installé.');

    const gone = setup({ 'auth status': new CliUnavailableError() });
    await expect(gone.setup.models('claude-code')).rejects.toThrow(
      'Claude Code n’est pas installé.',
    );
  });

  it('asks to log in from the terminal when the session is closed', async () => {
    const closed = setup({
      'auth status': { stdout: JSON.stringify({ loggedIn: false }) },
    });
    await expect(closed.setup.models('claude-code')).rejects.toThrow(
      'Votre session Claude Code est fermée : reconnectez-vous à Claude Code, puis réessayez.',
    );

    const failed = setup({ 'auth status': { exitCode: 1, stdout: 'Not logged in' } });
    await expect(failed.setup.models('claude-code')).rejects.toThrow(
      'Votre session Claude Code est fermée : reconnectez-vous à Claude Code, puis réessayez.',
    );
  });
});

describe('a "No such file or directory" warning on stderr', () => {
  const warning = 'warning: No such file or directory (os error 2)\n';
  const claudeClosed =
    'Votre session Claude Code est fermée : reconnectez-vous à Claude Code, puis réessayez.';
  const codexClosed = 'Votre session Codex est fermée : reconnectez-vous à Codex, puis réessayez.';

  it('does not stop a logged-in CLI that exits 0: the models are still listed', async () => {
    const claude = setup({ 'auth status': { stdout: loggedIn, stderr: warning } });
    const codex = setup({
      'login status': { stderr: `Logged in using ChatGPT\n${warning}` },
      'debug models': { stdout: catalog, stderr: warning },
    });

    expect(await claude.setup.models('claude-code')).toEqual([
      'default',
      'sonnet',
      'opus',
      'haiku',
    ]);
    expect(await codex.setup.models('codex')).toEqual(['default', 'gpt-a', 'gpt-b']);
  });

  it('still reads a closed session when the same warning comes along', async () => {
    const claude = setup({ 'auth status': { exitCode: 1, stderr: `Not logged in\n${warning}` } });
    const codex = setup({ 'login status': { exitCode: 1, stderr: `Not logged in\n${warning}` } });

    await expect(claude.setup.models('claude-code')).rejects.toThrow(claudeClosed);
    await expect(codex.setup.models('codex')).rejects.toThrow(codexClosed);
  });
});

describe('Codex setup', () => {
  it('offers the default and the listed models once logged in', async () => {
    const { runs, setup: tool } = setup({
      'login status': { stdout: 'Logged in using ChatGPT' },
      'debug models': { stdout: catalog },
    });

    expect(await tool.models('codex')).toEqual(['default', 'gpt-a', 'gpt-b']);
    expect(runs.map((run) => run.args.join(' '))).toEqual(['login status', 'debug models']);
  });

  it('still lets the user work with the default model when the catalog cannot be read', async () => {
    const { setup: tool } = setup({
      'login status': { stdout: 'Logged in using ChatGPT' },
      'debug models': { exitCode: 2, stderr: 'unknown command' },
    });

    expect(await tool.models('codex')).toEqual(['default']);
  });

  it('says plainly when it is not installed or not logged in', async () => {
    const { setup: missing } = setup({}, { locate: () => undefined });
    await expect(missing.models('codex')).rejects.toThrow('Codex n’est pas installé.');

    const out = setup({ 'login status': { exitCode: 1, stderr: 'Not logged in' } });
    await expect(out.setup.models('codex')).rejects.toThrow(
      'Votre session Codex est fermée : reconnectez-vous à Codex, puis réessayez.',
    );
  });
});
