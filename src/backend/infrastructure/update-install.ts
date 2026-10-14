import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { writeFileAtomic } from './safe-files';
import { INSTALL_PATH, INSTALL_SCRIPT, INSTALL_SHELL } from './update-install-script';

export interface InstallPlan {
  /** The app process: the script waits for its end. */
  pid: number;
  stagedPath: string;
  /** Real path of the running bundle. */
  targetPath: string;
  /** Hash the app just checked: the script recomputes it on what it copied. */
  sha256: string;
  logPath: string;
  /** How long the script waits for the app to end before giving up without touching anything. */
  waitSeconds: number;
  openProgram: string;
  dittoProgram: string;
}

const isBundlePath = (path: string) => isAbsolute(path) && path.endsWith('.app');

function assertSafePlan(plan: InstallPlan): void {
  const paths = [
    plan.stagedPath,
    plan.targetPath,
    plan.logPath,
    plan.openProgram,
    plan.dittoProgram,
  ];
  if (paths.some((path) => !isAbsolute(path) || path.includes('\0'))) {
    throw new Error('installation : chemin relatif ou octet nul');
  }
  if (!isBundlePath(plan.stagedPath) || !isBundlePath(plan.targetPath)) {
    throw new Error('installation : le paquet et la cible doivent être des .app');
  }
  if (plan.stagedPath === plan.targetPath) {
    throw new Error('installation : le paquet en attente est l’app à remplacer');
  }
  if (!Number.isSafeInteger(plan.pid) || plan.pid <= 1)
    throw new Error('installation : pid inattendu');
  if (!Number.isSafeInteger(plan.waitSeconds) || plan.waitSeconds < 1) {
    throw new Error('installation : délai inattendu');
  }
  if (!/^[0-9a-f]{64}$/.test(plan.sha256)) throw new Error('installation : empreinte inattendue');
}

/** The script arguments, in its order. Throws on anything the script would refuse too. */
export function installArgs(plan: InstallPlan): string[] {
  assertSafePlan(plan);
  return [
    String(plan.pid),
    plan.stagedPath,
    plan.targetPath,
    plan.sha256,
    plan.logPath,
    String(plan.waitSeconds),
    plan.openProgram,
    plan.dittoProgram,
  ];
}

function shellQuote(arg: string): string {
  return `'${arg.replaceAll("'", "'\\''")}'`;
}

/** The launched command as one line the shell would read back identically: for the log only. */
export function describeInstallCommand(scriptPath: string, plan: InstallPlan): string {
  return [INSTALL_SHELL, ...[scriptPath, ...installArgs(plan)].map(shellQuote)].join(' ');
}

/** Writes the fixed script, readable and executable by its owner only, atomically. */
export async function writeInstallScript(scriptPath: string): Promise<void> {
  await writeFileAtomic(scriptPath, INSTALL_SCRIPT, { mode: 0o700, ensureDirMode: 0o700 });
}

/** What the script inherits: enough to talk to the user session (`open`), nothing else. */
const INHERITED_ENV = ['HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG'] as const;

export function detachedEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { PATH: INSTALL_PATH };
  for (const name of INHERITED_ENV) {
    const value = base[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

/** Launches a program detached from the app (new session, no shared I/O): it outlives it. */
export function launchDetached(program: string, args: readonly string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(program, [...args], {
      detached: true,
      stdio: 'ignore',
      cwd: '/',
      env: detachedEnv(process.env),
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
