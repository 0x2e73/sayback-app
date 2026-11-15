import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cliEnvironment, locateCli } from './cli-environment';
import { CliSetup } from './cli-setup';
import { spawnCliRunner } from './cli-runner';
import { dependenciesFor, media, meeting, replying } from './cli-fake.test-support';
import { claudeCodeNotes } from './claude-code-notes';

// A CLI installed by npm or bun is a `#!/usr/bin/env node` script. The real runner starts the real
// launcher below (a fake of Codex: no provider is called); only `node` itself is the real one.
let home = '';
let runs = '';

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), 'sayback-launcher-')));
  runs = join(home, 'runs');
  await mkdir(runs);
  await mkdir(join(home, '.npm-global', 'bin'), { recursive: true });
  const launcher = join(home, '.npm-global', 'bin', 'codex');
  await writeFile(
    launcher,
    [
      '#!/usr/bin/env node',
      "const args = process.argv.slice(2).join(' ');",
      "if (args === 'login status') console.error('Logged in using ChatGPT');",
      "else if (args === 'debug models') console.log(JSON.stringify({ models: [{ slug: 'gpt-x', visibility: 'list' }] }));",
      'else process.exit(2);',
    ].join('\n'),
  );
  await chmod(launcher, 0o755);
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function setup(withNode: boolean) {
  return async () => {
    if (withNode) {
      await mkdir(join(home, '.local', 'bin'), { recursive: true });
      await symlink(process.execPath, join(home, '.local', 'bin', 'node'));
    }
    return new CliSetup({
      runner: spawnCliRunner,
      locate: (name) => locateCli(name, { home, path: '', system: [] }),
      environment: { HOME: home },
      tempRoot: runs,
    });
  };
}

describe('a CLI that is a node script', () => {
  it('starts when the folder of the node we can find joins its PATH', async () => {
    const tool = await setup(true)();

    expect(await tool.models('codex')).toEqual(['default', 'gpt-x']);
  });

  it('says the install is broken, not that the session is closed, when node cannot be found', async () => {
    const tool = await setup(false)();

    await expect(tool.models('codex')).rejects.toThrow(
      'L’installation de Codex semble endommagée : réinstallez Codex, puis réessayez.',
    );
  });
});

describe('the PATH of a CLI', () => {
  it('holds the program folder, the node folder and the system ones, absolute and once each', () => {
    const env = cliEnvironment({ PATH: '/somewhere/else' }, '/h/.npm-global/bin', [
      '/usr/local/bin',
      '/h/.npm-global/bin',
      'relative/bin',
    ]);

    expect(env.PATH).toBe('/h/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin');
  });
});

describe('a start that fails with the shell codes', () => {
  const broken =
    'L’installation de Claude Code semble endommagée : réinstallez Claude Code, puis réessayez.';

  it.each([
    ['exit 127', { exitCode: 127, stderr: '' }],
    ['exit 126', { exitCode: 126, stderr: '' }],
    ['a launcher without node', { exitCode: 1, stderr: 'env: node: No such file or directory\n' }],
  ])('is a broken install on %s, in a run too', async (_name, output) => {
    const fake = replying(output);
    const provider = claudeCodeNotes(() => 'default', media, dependenciesFor(fake.runner, home));

    await expect(provider.summarize(meeting)).rejects.toThrow(broken);
  });

  it('puts the folder of node on the PATH of a run', async () => {
    const fake = replying({ exitCode: 1 });
    const dependencies = dependenciesFor(fake.runner, runs, {
      locate: (name) => (name === 'node' ? '/usr/local/bin/node' : '/h/.npm-global/bin/claude'),
    });

    await claudeCodeNotes(() => 'default', media, dependencies)
      .summarize(meeting)
      .catch(() => undefined);

    expect(fake.seen[0]!.run.env.PATH).toBe(
      '/h/.npm-global/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    );
  });
});
