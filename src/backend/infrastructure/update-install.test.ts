import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { sha256Of, writeFakeBundle } from './test-bundle';
import {
  describeInstallCommand,
  detachedEnv,
  installArgs,
  installCommand,
  launchDetached,
  terminateDetached,
  type InstallPlan,
} from './update-install';
import { INSTALL_SCRIPT, INSTALL_SCRIPT_LABEL, INSTALL_SHELL } from './update-install-script';

const run = promisify(execFile);

let root: string;
let target: string;
let previous: string;
let staged: string;
let witness: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "sayback-launch d'été $HOME-")));
  target = join(root, 'Apps', 'SayBack.app');
  previous = join(root, 'Apps', 'SayBack.previous.app');
  staged = join(root, 'canal', 'updates', 'SayBack.app');
  witness = join(root, 'témoin.sh');
  // The app creates the log folder before launching the script.
  await mkdir(join(root, 'canal', 'logs'), { recursive: true });
  await writeFakeBundle(target, { asar: 'ancienne' });
  await writeFakeBundle(staged, { asar: 'nouvelle' });
  await writeFile(
    witness,
    '#!/bin/sh\nfor arg in "$@"; do printf \'%s\\n\' "$arg" >>"$0.ouvert"; done\n',
  );
  await chmod(witness, 0o700);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function plan(patch: Partial<InstallPlan> = {}): InstallPlan {
  return {
    pid: 4242,
    stagedPath: staged,
    targetPath: target,
    sha256: sha256Of('nouvelle'),
    logPath: join(root, 'canal', 'logs', 'update.log'),
    waitSeconds: 10,
    openProgram: witness,
    dittoProgram: '/usr/bin/ditto',
    ...patch,
  };
}

const asarOf = (path: string) => readFile(join(path, 'Contents', 'Resources', 'app.asar'), 'utf8');
const openedPaths = () => readFile(`${witness}.ouvert`, 'utf8').catch(() => '');
const isAlive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('ce que l’app lance', () => {
  it('le script fixe passe en argument de /bin/sh -c : aucun fichier de script', () => {
    const command = installCommand(plan());
    expect(command.program).toBe(INSTALL_SHELL);
    expect(command.args).toEqual([
      '-c',
      INSTALL_SCRIPT,
      INSTALL_SCRIPT_LABEL,
      ...installArgs(plan()),
    ]);
    expect(INSTALL_SCRIPT).not.toContain(root);
  });

  it('dans le script, chaque argument est lu entre guillemets doubles', () => {
    const code = INSTALL_SCRIPT.split('\n').filter((line) => !line.trimStart().startsWith('#'));
    for (const line of code) {
      const bare = line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'[^']*'/g, "''");
      // Command substitution, arithmetic, `$#`, `$$` and `$?` may stay unquoted.
      const expansions = bare.replace(/\$\(/g, '(').replace(/\$[#$?]/g, '');
      expect(expansions, line).not.toMatch(/\$/);
    }
  });
});

describe('installArgs', () => {
  it('les huit arguments, dans l’ordre du script', () => {
    expect(installArgs(plan())).toEqual([
      '4242',
      staged,
      target,
      sha256Of('nouvelle'),
      join(root, 'canal', 'logs', 'update.log'),
      '10',
      witness,
      '/usr/bin/ditto',
    ]);
  });

  it('refuse ce qui ne peut pas être un argument sûr', () => {
    const unsafe: Partial<InstallPlan>[] = [
      { targetPath: 'relatif/SayBack.app' },
      { stagedPath: `${staged}\0` },
      { targetPath: join(root, 'Apps') },
      { pid: 0 },
      { sha256: 'pas une empreinte' },
      { waitSeconds: 0 },
      { openProgram: 'open' },
      { stagedPath: target },
    ];
    for (const patch of unsafe) {
      expect(() => installArgs(plan(patch)), JSON.stringify(patch)).toThrow();
    }
  });
});

describe('lancement', () => {
  it('describeInstallCommand : les arguments, cités pour que le shell les relise à l’identique', async () => {
    const line = describeInstallCommand(plan());
    expect(line.startsWith(`${INSTALL_SHELL} -c <script fixe> '${INSTALL_SCRIPT_LABEL}' `)).toBe(
      true,
    );
    const quoted = line.slice(`${INSTALL_SHELL} -c <script fixe> `.length);
    const replay = `set -- ${quoted}; for arg in "$@"; do printf '%s\\0' "$arg"; done`;
    const { stdout } = await run('/bin/sh', ['-c', replay]);
    expect(stdout.split('\0').slice(0, -1)).toEqual([INSTALL_SCRIPT_LABEL, ...installArgs(plan())]);
  });

  it('l’environnement du script : PATH système et quelques variables de session seulement', () => {
    const env = detachedEnv({ HOME: '/Users/s', PATH: '/opt/x', SECRET: 'non', LANG: 'fr_CH' });
    expect(env).toEqual({ PATH: '/usr/bin:/bin', HOME: '/Users/s', LANG: 'fr_CH' });
  });

  it('launchDetached rend le pid sans attendre ; le script remplace l’app ensuite', async () => {
    const app = spawn('/bin/sleep', ['1.5'], { stdio: 'ignore' });
    const command = installCommand(plan({ pid: app.pid ?? 0 }));
    const pid = await launchDetached(command.program, command.args);
    expect(pid).toBeGreaterThan(1);
    expect(await asarOf(target)).toBe('ancienne');
    expect(await openedPaths()).toBe('');
    await expect.poll(openedPaths, { timeout: 4_000 }).toBe(`${target}\n`);
    expect(await asarOf(target)).toBe('nouvelle');
    expect(await asarOf(previous)).toBe('ancienne');
    expect(await readdir(join(root, 'canal', 'updates'))).toEqual(['SayBack.app']);
  });

  it('terminateDetached arrête le script qui attend : rien n’est touché, rien n’est relancé', async () => {
    const app = spawn('/bin/sleep', ['30'], { stdio: 'ignore' });
    const command = installCommand(plan({ pid: app.pid ?? 0 }));
    const pid = await launchDetached(command.program, command.args);
    expect(isAlive(pid)).toBe(true);
    terminateDetached(pid);
    await expect.poll(() => isAlive(pid), { timeout: 2_000 }).toBe(false);
    app.kill();
    expect(await asarOf(target)).toBe('ancienne');
    expect(await readdir(join(root, 'Apps'))).toEqual(['SayBack.app']);
    expect(await openedPaths()).toBe('');
  });

  it('launchDetached échoue proprement si le programme n’existe pas', async () => {
    await expect(launchDetached(join(root, 'absent'), [])).rejects.toThrow();
  });
});
