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
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { APP_EXECUTABLE_NAME } from '../../shared/update-channel';
import { sha256Of, writeFakeBundle } from './test-bundle';
import { installArgs, type InstallPlan } from './update-install';
import {
  INSTALL_EXIT,
  INSTALL_SCRIPT,
  INSTALL_SCRIPT_LABEL,
  INSTALL_SHELL,
} from './update-install-script';

// The install script, run for real by /bin/sh against fake bundles in a temporary folder: a fake
// app process that ends, a witness instead of `open`, the real `ditto` or a sabotaged one. Paths
// carry spaces, quotes, accents, `$` and `;`, like « Application Support ».

const run = promisify(execFile);
const OLD = 'ancienne version';
const NEW = 'nouvelle version';

let root: string;
let appsDir: string;
let target: string;
let previous: string;
let staged: string;
let logPath: string;
let witness: string;
let opened: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'sayback-install-')));
  appsDir = join(root, "Mes apps d'été $HOME ; `id`");
  const channelRoot = join(root, 'Application Support', "SayBack de l'équipe");
  target = join(appsDir, 'SayBack.app');
  previous = join(appsDir, 'SayBack.previous.app');
  staged = join(channelRoot, 'updates', 'SayBack.app');
  logPath = join(channelRoot, 'logs', 'update.log');
  witness = join(root, "témoin d'ouverture.sh");
  opened = `${witness}.ouvert`;
  await mkdir(join(channelRoot, 'logs'), { recursive: true });
  await writeFakeBundle(target, { asar: OLD });
  await writeFakeBundle(staged, { asar: NEW });
  // The fake `open` writes its arguments next to itself, one per line.
  await writeFile(
    witness,
    '#!/bin/sh\nfor arg in "$@"; do printf \'%s\\n\' "$arg" >>"$0.ouvert"; done\n',
  );
  await chmod(witness, 0o700);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const asarOf = (path: string) => readFile(join(path, 'Contents', 'Resources', 'app.asar'), 'utf8');
const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );
async function openedPaths(): Promise<string[]> {
  if (!(await exists(opened))) return [];
  return (await readFile(opened, 'utf8')).split('\n').filter((line) => line !== '');
}

/** A fake app process: lives `ms` milliseconds, then ends. */
function fakeApp(ms: number): number {
  const child = spawn('/bin/sleep', [String(ms / 1000)], { stdio: 'ignore' });
  if (child.pid === undefined) throw new Error('faux processus non lancé');
  return child.pid;
}

function plan(patch: Partial<InstallPlan> = {}): InstallPlan {
  return {
    pid: fakeApp(400),
    stagedPath: staged,
    targetPath: target,
    sha256: sha256Of(NEW),
    logPath,
    waitSeconds: 10,
    openProgram: witness,
    dittoProgram: '/usr/bin/ditto',
    ...patch,
  };
}

/** Runs the script like the app does (`/bin/sh -c <script> <label> <args>`): its exit code. */
async function execute(args: readonly string[]): Promise<number> {
  try {
    const argv = ['-c', INSTALL_SCRIPT, INSTALL_SCRIPT_LABEL, ...args];
    await run(INSTALL_SHELL, argv, { env: { PATH: '/usr/bin:/bin' } });
    return 0;
  } catch (error) {
    if (error instanceof Error && 'code' in error && typeof error.code === 'number') {
      return error.code;
    }
    throw error;
  }
}

async function fakeDitto(body: string): Promise<string> {
  const path = join(root, 'faux ditto.sh');
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o700);
  return path;
}

describe('le script d’installation, exécuté pour de vrai', () => {
  it('succès : nouvelle version en place, ancienne gardée, app relancée', async () => {
    const started = Date.now();
    expect(await execute(installArgs(plan()))).toBe(INSTALL_EXIT.Installed);
    expect(Date.now() - started).toBeGreaterThanOrEqual(350);
    expect(await asarOf(target)).toBe(NEW);
    expect(await asarOf(previous)).toBe(OLD);
    const executable = join(target, 'Contents', 'MacOS', APP_EXECUTABLE_NAME);
    expect((await stat(executable)).mode & 0o111).not.toBe(0);
    expect(await asarOf(staged)).toBe(NEW);
    expect(await openedPaths()).toEqual([target]);
    const log = await readFile(logPath, 'utf8');
    expect(log).toContain('installée');
    expect(log).toContain(target);
  });

  it('une seule sauvegarde : l’ancienne sauvegarde est remplacée', async () => {
    await writeFakeBundle(previous, { asar: 'sauvegarde d’avant-hier' });
    expect(await execute(installArgs(plan()))).toBe(INSTALL_EXIT.Installed);
    expect(await asarOf(previous)).toBe(OLD);
    expect((await readdir(appsDir)).sort()).toEqual(['SayBack.app', 'SayBack.previous.app']);
  });

  it('échec de la copie : retour arrière sur la version précédente, relancée', async () => {
    const ditto = await fakeDitto(
      'mkdir -p "$2/Contents/Resources" && printf moitié >"$2/Contents/Resources/app.asar"\nexit 1',
    );
    expect(await execute(installArgs(plan({ dittoProgram: ditto })))).toBe(INSTALL_EXIT.CopyFailed);
    expect(await asarOf(target)).toBe(OLD);
    expect(await exists(join(target, 'Contents', 'MacOS', APP_EXECUTABLE_NAME))).toBe(true);
    expect(await readdir(appsDir)).toEqual(['SayBack.app']);
    expect(await openedPaths()).toEqual([target]);
    expect(await readFile(logPath, 'utf8')).toContain('restaur');
  });

  it('copie d’une autre empreinte (paquet changé après le contrôle) : retour arrière', async () => {
    const changed = plan({ sha256: sha256Of('ce que l’app avait vérifié') });
    expect(await execute(installArgs(changed))).toBe(INSTALL_EXIT.HashMismatch);
    expect(await asarOf(target)).toBe(OLD);
    expect(await readdir(appsDir)).toEqual(['SayBack.app']);
    expect(await openedPaths()).toEqual([target]);
  });

  it('l’app tourne encore après le délai : rien n’est touché, rien n’est relancé', async () => {
    expect(await execute(installArgs(plan({ pid: process.pid, waitSeconds: 1 })))).toBe(
      INSTALL_EXIT.Timeout,
    );
    expect(await asarOf(target)).toBe(OLD);
    expect(await readdir(appsDir)).toEqual(['SayBack.app']);
    expect(await openedPaths()).toEqual([]);
    expect(await readFile(logPath, 'utf8')).toContain('rien n’est touché');
  });

  it('le paquet en attente a disparu : rien n’est touché, l’ancienne version est relancée', async () => {
    await rm(staged, { recursive: true });
    expect(await execute(installArgs(plan()))).toBe(INSTALL_EXIT.CopyFailed);
    expect(await asarOf(target)).toBe(OLD);
    expect(await readdir(appsDir)).toEqual(['SayBack.app']);
    expect(await openedPaths()).toEqual([target]);
  });

  it('arguments inattendus : refus sans rien toucher', async () => {
    const args = installArgs(plan({ pid: process.pid }));
    const [pid = '', stagedArg = ''] = args;
    expect(await execute(args.slice(0, 7))).toBe(INSTALL_EXIT.Usage);
    expect(await execute([...args, 'en trop'])).toBe(INSTALL_EXIT.Usage);
    expect(await execute(['1; touch /tmp/x', ...args.slice(1)])).toBe(INSTALL_EXIT.Usage);
    expect(await execute([pid, stagedArg, appsDir, ...args.slice(3)])).toBe(INSTALL_EXIT.Usage);
    expect(await execute([pid, 'relatif/SayBack.app', ...args.slice(2)])).toBe(INSTALL_EXIT.Usage);
    expect(await execute([pid, target, ...args.slice(2)])).toBe(INSTALL_EXIT.Usage);
    expect(await asarOf(target)).toBe(OLD);
    expect(await readdir(appsDir)).toEqual(['SayBack.app']);
    expect(await openedPaths()).toEqual([]);
  });

  it('le journal est un lien symbolique : rien n’est écrit à travers lui', async () => {
    const elsewhere = join(root, 'ailleurs.txt');
    await writeFile(elsewhere, 'intact');
    await rm(logPath, { force: true });
    await symlink(elsewhere, logPath);
    expect(await execute(installArgs(plan()))).toBe(INSTALL_EXIT.Installed);
    expect(await readFile(elsewhere, 'utf8')).toBe('intact');
    expect(await asarOf(target)).toBe(NEW);
  });

  it('rien du chemin n’est interprété par le shell', async () => {
    expect(await execute(installArgs(plan()))).toBe(INSTALL_EXIT.Installed);
    const names = await readdir(root);
    expect(names.filter((name) => name.startsWith('Mes apps'))).toEqual([
      "Mes apps d'été $HOME ; `id`",
    ]);
  });
});
