import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cliEnvironment, locateCli } from './cli-environment';

describe('cliEnvironment', () => {
  const source = {
    HOME: '/Users/someone',
    USER: 'someone',
    LANG: 'fr_CH.UTF-8',
    TMPDIR: '/var/folders/x/',
    PATH: '/Users/someone/bin:/usr/local/bin',
    CLAUDE_CONFIG_DIR: '/Users/someone/.claude-work',
    CODEX_HOME: '/Users/someone/.codex-work',
    HTTPS_PROXY: 'http://proxy.example:3128',
    ANTHROPIC_API_KEY: 'sk-ant-secret',
    ANTHROPIC_AUTH_TOKEN: 'token',
    OPENAI_API_KEY: 'sk-secret',
    GITHUB_TOKEN: 'ghp-secret',
    AWS_SECRET_ACCESS_KEY: 'aws',
    SAYBACK_ANYTHING: 'nope',
  };

  it('keeps what a logged-in CLI needs to find its account and the network', () => {
    const env = cliEnvironment(source, '/opt/homebrew/bin');

    expect(env).toMatchObject({
      HOME: '/Users/someone',
      USER: 'someone',
      LANG: 'fr_CH.UTF-8',
      TMPDIR: '/var/folders/x/',
      CLAUDE_CONFIG_DIR: '/Users/someone/.claude-work',
      CODEX_HOME: '/Users/someone/.codex-work',
      HTTPS_PROXY: 'http://proxy.example:3128',
    });
  });

  it('drops every key, token and variable it does not know: the subscription is the account', () => {
    const env = cliEnvironment(source, '/opt/homebrew/bin');

    expect(Object.keys(env).sort()).not.toContain('ANTHROPIC_API_KEY');
    expect(JSON.stringify(env)).not.toMatch(/secret|token|nope|aws/i);
  });

  it('builds its own PATH: the program folder, then the system ones, never the user PATH', () => {
    const env = cliEnvironment(source, '/opt/homebrew/bin');

    expect(env.PATH).toBe('/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin');
  });

  it('omits what is not set instead of writing "undefined"', () => {
    expect(cliEnvironment({ HOME: '/h' }, '/b')).toEqual({
      HOME: '/h',
      PATH: '/b:/usr/bin:/bin:/usr/sbin:/sbin',
    });
  });
});

describe('locateCli', () => {
  let home = '';
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'sayback-locate-'));
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  async function install(folder: string, name: string, mode = 0o755): Promise<string> {
    const path = join(home, folder, name);
    await mkdir(join(home, folder), { recursive: true });
    await writeFile(path, '#!/bin/sh\n');
    await chmod(path, mode);
    return path;
  }

  it('finds the program in the folders an app started from the Finder does not have in PATH', async () => {
    const installed = await install('.local/bin', 'claude');

    expect(locateCli('claude', { home, path: '', system: [] })).toBe(installed);
  });

  it('finds it in PATH when an absolute entry holds it, and ignores relative entries', async () => {
    const installed = await install('tools', 'codex');

    expect(
      locateCli('codex', { home, path: `relative/bin:${join(home, 'tools')}`, system: [] }),
    ).toBe(installed);
    expect(locateCli('codex', { home, path: 'tools', system: [] })).toBeUndefined();
  });

  it('ignores a file that cannot be run', async () => {
    await install('.local/bin', 'claude', 0o644);

    expect(locateCli('claude', { home, path: '', system: [] })).toBeUndefined();
  });

  it('returns nothing for a name that is not a plain program name', () => {
    expect(locateCli('../claude', { home, path: '', system: [] })).toBeUndefined();
  });
});
