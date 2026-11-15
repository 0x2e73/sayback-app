import { accessSync, constants, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

// What a logged-in CLI needs to find its account, its locale and the network. No API key and no
// token is listed: the subscription is the account, and nothing else leaves with the process.
const kept = [
  'HOME',
  'USER',
  'LOGNAME',
  'LANG',
  'LC_ALL',
  'TMPDIR',
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  'HTTPS_PROXY',
  'HTTP_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'https_proxy',
  'http_proxy',
  'all_proxy',
  'no_proxy',
  'SSL_CERT_FILE',
  'NODE_EXTRA_CA_CERTS',
] as const;

const systemPath = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];

/**
 * The PATH is rebuilt, never inherited: the program folder, the extra folders asked for (the one
 * that holds `node`, for a CLI that is a `#!/usr/bin/env node` script), then the system ones.
 */
export function cliEnvironment(
  source: NodeJS.ProcessEnv,
  programFolder: string,
  extraFolders: string[] = [],
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of kept) {
    const value = source[name];
    if (value) env[name] = value;
  }
  // Absolute folders only, once each: a relative entry would resolve against the run folder.
  const folders = [programFolder, ...extraFolders, ...systemPath].filter(isAbsolute);
  env.PATH = [...new Set(folders)].join(':');
  return env;
}

interface LocateOptions {
  home: string;
  path: string;
  /** Folders searched after the home ones; replaceable so a test sees only its own. */
  system?: string[];
}

const defaultSystemFolders = ['/opt/homebrew/bin', '/usr/local/bin'];

function runnable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * An app started from the Finder has a short PATH: look where the installers put the programs.
 * Relative PATH entries are skipped, they would resolve against whatever folder the app started in.
 */
export function locateCli(name: string, options: LocateOptions): string | undefined {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return undefined;
  const folders = [
    join(options.home, '.local', 'bin'),
    join(options.home, '.claude', 'local'),
    ...(options.system ?? defaultSystemFolders),
    join(options.home, '.npm-global', 'bin'),
    join(options.home, '.bun', 'bin'),
    ...options.path.split(':').filter((entry) => isAbsolute(entry)),
  ];
  return folders.map((folder) => join(folder, name)).find(runnable);
}
