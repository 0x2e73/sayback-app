import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import {
  INSTALL_PATH,
  INSTALL_SCRIPT,
  INSTALL_SCRIPT_LABEL,
  INSTALL_SHELL,
} from './update-install-script';

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

/** `/bin/sh -c <fixed script> <label> <arguments>`: nothing is written to disk. */
export function installCommand(plan: InstallPlan): { program: string; args: string[] } {
  return {
    program: INSTALL_SHELL,
    args: ['-c', INSTALL_SCRIPT, INSTALL_SCRIPT_LABEL, ...installArgs(plan)],
  };
}

/** The launched command for the log: the fixed script elided, the arguments quoted for replay. */
export function describeInstallCommand(plan: InstallPlan): string {
  const quoted = [INSTALL_SCRIPT_LABEL, ...installArgs(plan)].map(shellQuote);
  return [INSTALL_SHELL, '-c', '<script fixe>', ...quoted].join(' ');
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

/**
 * Launches a program detached from the app (new session, no shared I/O): it outlives it.
 * Resolves with its pid once it runs.
 */
export function launchDetached(program: string, args: readonly string[]): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(program, [...args], {
      detached: true,
      stdio: 'ignore',
      cwd: '/',
      env: detachedEnv(process.env),
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      if (child.pid === undefined) reject(new Error('installation : processus sans pid'));
      else resolve(child.pid);
    });
  });
}

/** Stops a detached program and its children (its whole process group). Never throws. */
export function terminateDetached(pid: number): void {
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    // Already gone.
  }
}
